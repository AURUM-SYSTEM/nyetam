import { useOnline } from "@/hooks/use-online";
import { Wifi, WifiOff } from "lucide-react";

export function SyncStatus() {
  const online = useOnline();
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest ${
        online
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-amber-500/10 text-amber-400"
      }`}
      title={online ? "En ligne" : "Hors ligne"}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          online ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
        }`}
      />
      {online ? (
        <>
          <Wifi className="h-3 w-3" /> En ligne
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" /> Hors ligne
        </>
      )}
    </div>
  );
}
