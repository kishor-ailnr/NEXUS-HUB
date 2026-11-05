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
    if (confirmText.trim().toLowerCase() !== 'clear demo data') {
      toast.error('Please type "CLEAR DEMO DATA" to confirm.');
      return;
    }

    try {
      setIsDeleting(true);
      const res = await fleetTwinApi.purgeMockData();
      toast.success(res.message || 'Demo data cleared successfully.');
      onPurged();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to clear demo data.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md bg-white border border-rose-200 rounded-2xl p-6 shadow-2xl text-slate-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 cursor-pointer p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4 text-rose-600">
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
            <AlertTriangle className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Clear Demo Fleet Data</h3>
            <p className="text-xs text-rose-600 font-medium">Demo lifecycle cleanup</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
          This will clear the 4 demo fleets, 24 simulated trucks, drivers, and 48-hour prediction
          timelines. Real multimodal logistics operations will remain completely untouched.
        </p>

        <div className="space-y-2 mb-5">
          <label className="text-xs font-medium text-slate-700">
            Type <span className="font-mono text-rose-600 font-bold">CLEAR DEMO DATA</span> to confirm:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="CLEAR DEMO DATA"
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-xs h-9 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePurge}
            disabled={isDeleting || confirmText.trim().toLowerCase() !== 'clear demo data'}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-9 px-4 gap-1.5 font-medium shadow-xs cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Clearing...' : 'Clear Demo Data'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

