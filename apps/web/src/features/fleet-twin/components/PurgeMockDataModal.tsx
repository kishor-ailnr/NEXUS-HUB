import React, { useState } from 'react';
import { Trash2, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { fleetTwinApi } from '../services/fleetTwinApi';
import { toast } from 'sonner';

interface PurgeMockDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurged: () => void;
}

export const PurgeMockDataModal: React.FC<PurgeMockDataModalProps> = ({
  isOpen,
  onClose,
  onPurged,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handlePurge = async () => {
    if (confirmText.toLowerCase() !== 'purge mock data') {
      toast.error('Please type "PURGE MOCK DATA" to confirm.');
      return;
    }

    try {
      setIsDeleting(true);
      const res = await fleetTwinApi.purgeMockData();
      toast.success(res.message || 'Mock data purged successfully.');
      onPurged();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to purge mock data.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-xl p-6 shadow-2xl text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4 text-rose-400">
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Purge Mock Fleet Twin Data</h3>
            <p className="text-xs text-rose-400/80">Irreversible mock lifecycle cleanup</p>
          </div>
        </div>

        <p className="text-sm text-slate-300 mb-4 leading-relaxed">
          This will wipe all 4 mock fleets, 24 simulated trucks, 24 drivers, 250+ checkpoints, and
          prediction histories from the database and memory. Real multimodal operations will remain untouched.
        </p>

        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 mb-4 text-xs space-y-1.5 text-slate-400">
          <div className="flex items-center gap-2 text-rose-300">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Target Tables: <code>mock_fleets</code>, <code>mock_vehicles</code>, <code>mock_predictions</code></span>
          </div>
          <div>Filter: <code>is_mock = true</code></div>
        </div>

        <div className="space-y-2 mb-5">
          <label className="text-xs font-medium text-slate-300">
            Type <span className="font-mono text-rose-400 font-bold">PURGE MOCK DATA</span> to confirm:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="PURGE MOCK DATA"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePurge}
            disabled={isDeleting || confirmText.toLowerCase() !== 'purge mock data'}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-9 px-4 gap-1.5 font-medium shadow-md shadow-rose-900/40"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Purging...' : 'Confirm Purge'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

