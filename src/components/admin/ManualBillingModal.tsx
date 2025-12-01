import React, { useState, useEffect } from 'react';
import { X, Loader2, DollarSign, CreditCard, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ManualBillingModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    startDate: Date;
    endDate: Date;
    onSuccess: () => void;
}

interface BillingPreview {
    usage: {
        totalCents: number;
        totalMinutes: number;
    };
    walletBalanceCents: number;
    walletAppliedCents: number;
    amountToChargeCents: number;
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
};

export function ManualBillingModal({
    isOpen,
    onClose,
    userId,
    startDate,
    endDate,
    onSuccess,
}: ManualBillingModalProps) {
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<BillingPreview | null>(null);
    const [showConfirmation, setShowConfirmation] = useState(false);

    useEffect(() => {
        if (isOpen && userId) {
            fetchPreview();
            setShowConfirmation(false);
        }
    }, [isOpen, userId, startDate, endDate]);

    const fetchPreview = async () => {
        setLoading(true);
        setError(null);
        try {
            // Ensure end date covers the full day
            const adjustedEndDate = new Date(endDate);
            adjustedEndDate.setHours(23, 59, 59, 999);

            const { data, error } = await supabase.functions.invoke('process-manual-billing', {
                body: {
                    userId,
                    startDate: startDate.toISOString(),
                    endDate: adjustedEndDate.toISOString(),
                    dryRun: true,
                },
            });

            if (error) throw error;
            setPreview(data);
        } catch (err: any) {
            console.error('Error fetching billing preview:', err);
            setError(err.message || 'Failed to load billing preview');
        } finally {
            setLoading(false);
        }
    };

    const handleProcess = async () => {
        if (!showConfirmation) {
            setShowConfirmation(true);
            return;
        }

        setProcessing(true);
        setError(null);
        try {
            // Ensure end date covers the full day
            const adjustedEndDate = new Date(endDate);
            adjustedEndDate.setHours(23, 59, 59, 999);

            const { error } = await supabase.functions.invoke('process-manual-billing', {
                body: {
                    userId,
                    startDate: startDate.toISOString(),
                    endDate: adjustedEndDate.toISOString(),
                    dryRun: false,
                },
            });

            if (error) throw error;
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error processing billing:', err);
            setError(err.message || 'Failed to process billing');
        } finally {
            setProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-card bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Process Manual Bill</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    {error && (
                        <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                            <p className="text-sm text-gray-500">Calculating costs...</p>
                        </div>
                    ) : preview ? (
                        <div className="space-y-6">
                            <div className="grid gap-4">
                                <div className="p-4 rounded-lg bg-gray-50 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-500">Period</span>
                                        <span className="text-sm font-medium text-gray-900">
                                            {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-gray-500">Usage</span>
                                        <span className="text-sm font-medium text-gray-900">
                                            {preview.usage.totalMinutes.toFixed(1)} mins
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-3 border border-gray-200 rounded-md">
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="w-4 h-4 text-gray-500" />
                                            <span className="text-sm font-medium">Total Cost</span>
                                        </div>
                                        <span className="font-mono font-semibold">
                                            {formatCurrency(preview.usage.totalCents / 100)}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center p-3 border border-gray-200 rounded-md">
                                        <div className="flex items-center gap-2">
                                            <Wallet className="w-4 h-4 text-gray-500" />
                                            <span className="text-sm font-medium">Wallet Balance</span>
                                        </div>
                                        <span className="font-mono text-gray-500">
                                            {formatCurrency(preview.walletBalanceCents / 100)}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center p-3 border border-green-200 rounded-md bg-green-50">
                                        <div className="flex items-center gap-2">
                                            <Wallet className="w-4 h-4 text-green-600" />
                                            <span className="text-sm font-medium text-green-700">Wallet Applied</span>
                                        </div>
                                        <span className="font-mono font-semibold text-green-700">
                                            -{formatCurrency(preview.walletAppliedCents / 100)}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center p-3 border border-blue-200 rounded-md bg-blue-50">
                                        <div className="flex items-center gap-2">
                                            <CreditCard className="w-4 h-4 text-blue-600" />
                                            <span className="text-sm font-medium text-blue-700">Amount to Charge</span>
                                        </div>
                                        <span className="font-mono font-bold text-lg text-blue-700">
                                            {formatCurrency(preview.amountToChargeCents / 100)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {showConfirmation && (
                        <div className="p-3 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md">
                            Are you sure you want to process this charge? This will charge the user's card or deduct from their wallet.
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                        disabled={processing}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleProcess}
                        disabled={loading || processing || !preview}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${showConfirmation ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                        {showConfirmation ? 'Confirm Charge' : 'Process Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
}
