"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, AlertTriangle, CheckCircle, XCircle, ExternalLink } from 'lucide-react';

const PROBLEMATIC_CALL_ID = "68f9db11e029aa903a5fe01b";

export default function APITester() {
    const [testResults, setTestResults] = useState({});
    const [loading, setLoading] = useState(false);

    const testAudioAPI = async () => {
        setLoading(true);
        try {
            console.log('🔍 Testing audio API for call:', PROBLEMATIC_CALL_ID);
            
            const apiUrl = `/api/calls/${PROBLEMATIC_CALL_ID}/audio`;
            console.log('🔍 API URL:', apiUrl);
            
            const response = await fetch(apiUrl);
            const responseText = await response.text();
            
            const result = {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseText,
                timestamp: new Date().toLocaleString('vi-VN'),
                url: apiUrl
            };
            
            console.log('🔍 API Response:', result);
            setTestResults(result);
            
        } catch (error) {
            console.error('❌ API Test Error:', error);
            setTestResults({
                error: error.message,
                timestamp: new Date().toLocaleString('vi-VN')
            });
        } finally {
            setLoading(false);
        }
    };

    const openAPIDirectly = () => {
        const apiUrl = `/api/calls/${PROBLEMATIC_CALL_ID}/audio`;
        window.open(apiUrl, '_blank');
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-500" />
                        API Tester for Call: {PROBLEMATIC_CALL_ID}
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
                            <Button onClick={openAPIDirectly} variant="outline">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open API Directly
                            </Button>
                        </div>

                        {/* Test Results */}
                        {Object.keys(testResults).length > 0 && (
                            <div className="space-y-4">
                                {/* Status */}
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <h3 className="font-medium mb-2">API Response Status:</h3>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Badge variant={testResults.status === 200 ? 'default' : 'destructive'}>
                                            {testResults.status} {testResults.statusText}
                                        </Badge>
                                        <span className={`text-sm ${testResults.ok ? 'text-green-600' : 'text-red-600'}`}>
                                            {testResults.ok ? '✅ OK' : '❌ Error'}
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        <div><strong>URL:</strong> {testResults.url}</div>
                                        <div><strong>Timestamp:</strong> {testResults.timestamp}</div>
                                    </div>
                                </div>

                                {/* Headers */}
                                {testResults.headers && (
                                    <div className="bg-blue-50 rounded-lg p-4">
                                        <h3 className="font-medium mb-2">Response Headers:</h3>
                                        <div className="text-sm space-y-1">
                                            {Object.entries(testResults.headers).map(([key, value]) => (
                                                <div key={key} className="flex justify-between">
                                                    <span className="font-medium">{key}:</span>
                                                    <span className="text-gray-600">{value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Body */}
                                {testResults.body && (
                                    <div className="bg-yellow-50 rounded-lg p-4">
                                        <h3 className="font-medium mb-2">Response Body:</h3>
                                        <div className="text-sm">
                                            <pre className="whitespace-pre-wrap bg-white p-2 rounded border">
                                                {testResults.body}
                                            </pre>
                                        </div>
                                    </div>
                                )}

                                {/* Error */}
                                {testResults.error && (
                                    <div className="bg-red-50 rounded-lg p-4">
                                        <h3 className="font-medium text-red-800 mb-2">Error:</h3>
                                        <div className="text-sm text-red-700">
                                            {testResults.error}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Expected Results */}
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <h3 className="font-medium text-green-800 mb-2">Expected Results:</h3>
                            <div className="text-sm text-green-700 space-y-1">
                                <div>• <strong>Status:</strong> 200 OK</div>
                                <div>• <strong>Content-Type:</strong> audio/webm</div>
                                <div>• <strong>Content-Length:</strong> &gt; 0</div>
                                <div>• <strong>Body:</strong> Binary audio data (not text)</div>
                            </div>
                        </div>

                        {/* Debug Info */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h3 className="font-medium text-gray-800 mb-2">Debug Information:</h3>
                            <div className="text-sm text-gray-700 space-y-1">
                                <div><strong>Call ID:</strong> {PROBLEMATIC_CALL_ID}</div>
                                <div><strong>Expected File ID:</strong> 1mpS86ea7LWrc06xhmyMYHsZfVxtGS5uM</div>
                                <div><strong>API Endpoint:</strong> /api/calls/[callId]/audio</div>
                                <div><strong>Method:</strong> GET</div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
