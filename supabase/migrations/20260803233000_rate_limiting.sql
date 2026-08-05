-- Migration: 006_rate_limiting.sql
-- Description: Adds a user_usage table and an RPC to safely increment API limits.

-- 1. Create the user_usage table
CREATE TABLE IF NOT EXISTS public.user_usage (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    imports_today INTEGER NOT NULL DEFAULT 0,
    gemini_calls_today INTEGER NOT NULL DEFAULT 0,
    last_reset TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
CREATE POLICY "Users can view their own usage"
    ON public.user_usage
    FOR SELECT
    USING (auth.uid() = user_id);

-- Note: We do not allow users to insert/update their own usage directly.
-- That will be handled via the Service Role or specific RPCs.

-- 4. RPC to safely increment usage and handle daily resets
CREATE OR REPLACE FUNCTION public.increment_usage(
    p_user_id UUID,
    p_usage_type TEXT,
    p_max_limit INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_usage RECORD;
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_new_count INTEGER;
BEGIN
    -- Ensure the usage record exists using upsert logic
    INSERT INTO public.user_usage (user_id, last_reset)
    VALUES (p_user_id, v_now)
    ON CONFLICT (user_id) DO NOTHING;

    -- Lock the row for update to prevent race conditions
    SELECT * INTO v_current_usage
    FROM public.user_usage
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Check if we need to reset the counters (last_reset is older than 24 hours)
    IF v_current_usage.last_reset < (v_now - INTERVAL '24 hours') THEN
        UPDATE public.user_usage
        SET 
            imports_today = 0,
            gemini_calls_today = 0,
            last_reset = v_now,
            updated_at = v_now
        WHERE user_id = p_user_id;

        -- Refresh the record
        SELECT * INTO v_current_usage
        FROM public.user_usage
        WHERE user_id = p_user_id;
    END IF;

    -- Determine which counter to check/increment
    IF p_usage_type = 'import' THEN
        IF v_current_usage.imports_today >= p_max_limit THEN
            RETURN FALSE; -- Limit reached
        END IF;
        
        UPDATE public.user_usage
        SET imports_today = imports_today + 1,
            updated_at = v_now
        WHERE user_id = p_user_id;
        
        RETURN TRUE;

    ELSIF p_usage_type = 'gemini' THEN
        IF v_current_usage.gemini_calls_today >= p_max_limit THEN
            RETURN FALSE; -- Limit reached
        END IF;
        
        UPDATE public.user_usage
        SET gemini_calls_today = gemini_calls_today + 1,
            updated_at = v_now
        WHERE user_id = p_user_id;
        
        RETURN TRUE;
        
    ELSE
        RAISE EXCEPTION 'Invalid usage type: %', p_usage_type;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
