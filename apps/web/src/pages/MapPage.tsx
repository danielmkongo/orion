import { MapPin } from 'lucide-react';

export function MapPage() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-116px)]">
      <div className="text-center p-8">
        <MapPin size={32} className="text-muted-foreground/40 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Google Maps Not Installed</h2>
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          The map feature requires @vis.gl/react-google-maps. Install it with:
        </p>
        <code className="inline-block bg-muted px-3 py-2 rounded-lg text-xs font-mono text-foreground mb-4">
          pnpm install @vis.gl/react-google-maps
        </code>
        <p className="text-xs text-muted-foreground">Then restart the development server.</p>
      </div>
    </div>
  );
}
