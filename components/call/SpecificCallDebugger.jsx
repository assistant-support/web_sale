"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import RecordingPlayer from './RecordingPlayer';
import { debugSpecificCall } from '@/app/actions/debug-call.action';

const PROBLEMATIC_CALL_ID = "68f9db11e029aa903a5fe01b";

export default function SpecificCallDebugger() {
    const [testResults, setTestResults] = useState({});
    const [loading, setLoading] = useState(false);

    const testAudioAPI = async () => {
        setLoading(true);
        try {
            
            const response = await fetch(`/api/calls/${PROBLEMATIC_CALL_ID}/audio`);
            const result = {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: Object.fromEntries(response.headers.entries()),
                timestamp: new Date().toLocaleString('vi-VN')
            };
            
            
            setTestResults(result);
            
        } catch (error) {
           
            setTestResults({
                error: error.message,
                timestamp: new Date().toLocaleString('vi-VN')
            });
        } finally {
            setLoading(false);
        }
    };

    const testDirectDriveAccess = async () => {
        setLoading(true);
        try {
           
            
            const result = await debugSpecificCall(PROBLEMATIC_CALL_ID);
            
            
            setTestResults(prev => ({
                ...prev,
                directDriveTest: result
            }));
            
        } catch (error) {
            
            setTestResults(prev => ({
                ...prev,
                directDriveTest: { error: error.message }
            }));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                        Debug Specific Call: {PROBLEMATIC_CALL_ID}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Test Buttons */}
                        <div className="flex gap-2">
                            <Button onClick={testAudioAPI} disabled={loading} variant="outline">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                                Test Audio API
                            </Button>
                            <Button onClick={testDirectDriveAccess} disabled={loading} variant="outline">
                                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
                                Test Drive Access
                            </Button>
                        </div>

                        {/* Test Results */}
                        {Object.keys(testResults).length > 0 && (
                            <div className="space-y-4">
                                {/* API Test Results */}
                                {testResults.status && (
                                    <div className="bg-gray-50 rounded-lg p-4">
                                        <h3 className="font-medium mb-2">API Test Results:</h3>
                                        <div className="text-sm space-y-1">
                                            <div><strong>Status:</strong> {testResults.status}</div>
                                            <div><strong>Status Text:</strong> {testResults.statusText}</div>
                                            <div><strong>OK:</strong> {testResults.ok ? 'Yes' : 'No'}</div>
                                            <div><strong>Content-Type:</strong> {testResults.headers?.['content-type']}</div>
                                            <div><strong>Content-Length:</strong> {testResults.headers?.['content-length']}</div>
                                            <div><strong>Timestamp:</strong> {testResults.timestamp}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Direct Drive Test Results */}
                                {testResults.directDriveTest && (
                                    <div className="bg-blue-50 rounded-lg p-4">
                                        <h3 className="font-medium mb-2">Direct Drive Test Results:</h3>
                                        <div className="text-sm space-y-1">
                                            {testResults.directDriveTest.success ? (
                                                <>
                                                    <div className="text-green-600">
                                                        <strong>✅ Success:</strong> Drive access working
                                                    </div>
                                                    <div><strong>Call ID:</strong> {testResults.directDriveTest.data?.call?._id}</div>
                                                    <div><strong>File ID:</strong> {testResults.directDriveTest.data?.call?.file}</div>
                                                    <div><strong>Drive File ID:</strong> {testResults.directDriveTest.data?.drive?.fileId}</div>
                                                    <div><strong>File Name:</strong> {testResults.directDriveTest.data?.drive?.name}</div>
                                                    <div><strong>File Size:</strong> {testResults.directDriveTest.data?.drive?.size} bytes</div>
                                                    <div><strong>MIME Type:</strong> {testResults.directDriveTest.data?.drive?.mimeType}</div>
                                                    <div><strong>Has Permission:</strong> {testResults.directDriveTest.data?.permissions?.hasPermission ? 'Yes' : 'No'}</div>
                                                </>
                                            ) : (
                                                <div className="text-red-600">
                                                    <strong>❌ Error:</strong> {testResults.directDriveTest.error}
                                                    {testResults.directDriveTest.details && (
                                                        <div className="mt-1 text-xs">
                                                            <div>Code: {testResults.directDriveTest.details.code}</div>
                                                            <div>Status: {testResults.directDriveTest.details.status}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Audio Player Test */}
                        <div className="border-t pt-4">
                            <h3 className="font-medium mb-2">Audio Player Test:</h3>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <div className="text-sm text-blue-700 mb-2">
                                    Testing RecordingPlayer component with problematic call ID
                                </div>
                                <RecordingPlayer 
                                    callId={PROBLEMATIC_CALL_ID} 
                                    className="w-full"
                                />
                            </div>
                        </div>

                        {/* Debug Info */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <h3 className="font-medium text-yellow-800 mb-2">Debug Information:</h3>
                            <div className="text-sm text-yellow-700 space-y-1">
                                <div><strong>Problematic Call ID:</strong> {PROBLEMATIC_CALL_ID}</div>
                                <div><strong>Expected File ID:</strong> 1mpS86ea7LWrc06xhmyMYHsZfVxtGS5uM</div>
                                <div><strong>Status:</strong> completed</div>
                                <div><strong>Duration:</strong> 8s</div>
                                <div><strong>Created:</strong> 2025-10-23T07:33:57.865+00:00</div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
