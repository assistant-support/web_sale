"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import RecordingPlayer from './RecordingPlayer';

const TEST_CALLS = [
    {
        id: "68f6fafbd660c9a92fe11716",
        user: "68d15abdbe64c8353cc74522",
        status: "completed",
        duration: 15,
        note: "Same user - should work"
    },
    {
        id: "68f9cf7373ab90574f492768", 
        user: "68d15abdbe64c8353cc74522",
        status: "failed",
        duration: 0,
        note: "Same user - should work"
    },
    {
        id: "68f9db11e029aa903a5fe01b",
        user: "68b0af5cf58b8340827174e0", 
        status: "completed",
        duration: 8,
        note: "Different user - should work now (FIXED)"
    }
];

export default function PermissionFixTester() {
    const [testResults, setTestResults] = useState({});
    const [loading, setLoading] = useState(false);

    const testAllCalls = async () => {
        setLoading(true);
        const results = {};
        
        try {
            for (const call of TEST_CALLS) {
                console.log(`🔍 Testing call: ${call.id}`);
                
                try {
                    const response = await fetch(`/api/calls/${call.id}/audio`);
                    results[call.id] = {
                        status: response.status,
                        ok: response.ok,
                        statusText: response.statusText,
                        headers: Object.fromEntries(response.headers.entries()),
                        note: call.note
                    };
                    
                    console.log(`✅ Call ${call.id} result:`, results[call.id]);
                } catch (error) {
                    results[call.id] = {
                        error: error.message,
                        note: call.note
                    };
                    console.error(`❌ Call ${call.id} error:`, error);
                }
            }
            
            setTestResults(results);
        } catch (error) {
            console.error('❌ Test error:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (result) => {
        if (result.error) return <XCircle className="h-4 w-4 text-red-500" />;
        if (result.status === 200) return <CheckCircle className="h-4 w-4 text-green-500" />;
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    };

    const getStatusColor = (result) => {
        if (result.error) return 'destructive';
        if (result.status === 200) return 'default';
        return 'secondary';
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                        Permission Fix Tester
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Test Button */}
                        <div className="flex gap-2">
                            <Button onClick={testAllCalls} disabled={loading} variant="outline">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                                Test All Calls
                            </Button>
                        </div>

                        {/* Test Results */}
                        {Object.keys(testResults).length > 0 && (
                            <div className="space-y-3">
                                <h3 className="font-medium">Test Results:</h3>
                                {TEST_CALLS.map((call) => {
                                    const result = testResults[call.id];
                                    return (
                                        <div key={call.id} className="bg-gray-50 rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    {getStatusIcon(result)}
                                                    <span className="font-medium">Call: {call.id}</span>
                                                    <Badge variant={getStatusColor(result)}>
                                                        {result?.status || 'Error'}
                                                    </Badge>
                                                </div>
                                                <span className="text-sm text-gray-500">{call.note}</span>
                                            </div>
                                            
                                            {result?.error ? (
                                                <div className="text-sm text-red-600">
                                                    <strong>Error:</strong> {result.error}
                                                </div>
                                            ) : (
                                                <div className="text-sm space-y-1">
                                                    <div><strong>Status:</strong> {result.status} {result.statusText}</div>
                                                    <div><strong>Content-Type:</strong> {result.headers?.['content-type']}</div>
                                                    <div><strong>Content-Length:</strong> {result.headers?.['content-length']}</div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Audio Player Tests */}
                        <div className="border-t pt-4">
                            <h3 className="font-medium mb-2">Audio Player Tests:</h3>
                            <div className="space-y-3">
                                {TEST_CALLS.map((call) => (
                                    <div key={call.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                        <div className="text-sm font-medium text-blue-800 mb-2">
                                            Call {call.id} - {call.note}
                                        </div>
                                        <RecordingPlayer 
                                            callId={call.id} 
                                            className="w-full"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Expected Results */}
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="font-medium text-green-800 mb-2">Expected Results After Fix:</h3>
                            <div className="text-sm text-green-700 space-y-1">
                                <div>• <strong>All calls:</strong> Status 200 OK</div>
                                <div>• <strong>Content-Type:</strong> audio/webm</div>
                                <div>• <strong>Audio players:</strong> Should load without errors</div>
                                <div>• <strong>Different user calls:</strong> Should work now (permission bypassed)</div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
