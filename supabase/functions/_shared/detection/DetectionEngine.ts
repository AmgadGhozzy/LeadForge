// ──────────────────────────────────────────────
// Detection Engine
// Orchestrates all detectors against a single HTML string.
// Returns a full DetectionReport.
// ──────────────────────────────────────────────

import { DetectionReport } from './types.ts';
import { BookingDetector }   from './detectors/BookingDetector.ts';
import { ChatbotDetector }   from './detectors/ChatbotDetector.ts';
import { WhatsAppDetector }  from './detectors/WhatsAppDetector.ts';
import { SocialDetector }    from './detectors/SocialDetector.ts';
import { AnalyticsDetector } from './detectors/AnalyticsDetector.ts';
import { PixelDetector }     from './detectors/PixelDetector.ts';
import { TechStackDetector } from './detectors/TechStackDetector.ts';
import { ContactDetector }   from './detectors/ContactDetector.ts';

export class DetectionEngine {
  private booking   = new BookingDetector();
  private chatbot   = new ChatbotDetector();
  private whatsapp  = new WhatsAppDetector();
  private social    = new SocialDetector();
  private analytics = new AnalyticsDetector();
  private pixels    = new PixelDetector();

  // These are stateful — expose them so enrichment-service can read
  // extracted items without a second parse pass.
  readonly techStack = new TechStackDetector();
  readonly contacts  = new ContactDetector();

  /**
   * Run all detectors against the provided HTML.
   * Each detector is independent and does not share state.
   */
  run(html: string, links?: string[]): DetectionReport {
    return {
      booking:   this.booking.detect(html, links),
      chatbot:   this.chatbot.detect(html),
      whatsapp:  this.whatsapp.detect(html),
      social:    this.social.detect(html),
      analytics: this.analytics.detect(html),
      pixels:    this.pixels.detect(html),
      techStack: this.techStack.detect(html),
      contacts:  this.contacts.detect(html),
      scanned_at: new Date().toISOString(),
    };
  }
}
