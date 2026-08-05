import { useState } from 'react';
import { Search, MapPin, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SearchFormProps {
  onSubmit: (data: { keyword: string; city: string; country: string }) => void;
  isLoading: boolean;
}

export function SearchForm({ onSubmit, isLoading }: SearchFormProps) {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword) return;
    onSubmit({ keyword, city, country });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find New Businesses</CardTitle>
        <CardDescription>
          Search Google Places for businesses to import into LeadForge.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 relative">
              <label className="text-sm font-medium">Keyword (Required)</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. Dentists, Marketing Agencies"
                  className="pl-9"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">City (Optional)</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. Cairo"
                  className="pl-9"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Country (Optional)</label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. Egypt"
                  className="pl-9"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isLoading || !keyword} className="w-full md:w-auto self-end">
            {isLoading ? 'Importing...' : 'Search & Import'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
