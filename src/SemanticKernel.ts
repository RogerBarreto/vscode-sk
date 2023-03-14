// Copyright (c) Microsoft. All rights reserved.
import fetch from 'node-fetch';
import { IAsk } from "./models/Ask";
import { IAskResult } from "./models/AskResult";
import { IKeyConfig, SK_HTTP_HEADER_API_KEY, SK_HTTP_HEADER_COMPLETION, SK_HTTP_HEADER_ENDPOINT, SK_HTTP_HEADER_MODEL, SK_HTTP_HEADER_MSGRAPH } from "./models/KeyConfig";

interface ServiceRequest {
    commandPath: string;
    method?: string;
    body?: unknown;
    keyConfig: IKeyConfig;
}

export class SemanticKernel {
    // eslint-disable-next-line @typescript-eslint/space-before-function-paren
    public invokeAsync = async (ask: IAsk, skillName: string, functionName: string, keyConfig: IKeyConfig): Promise<IAskResult> => {

        const result = await this.getResponseAsync<IAskResult>({
            commandPath: `/api/skills/${skillName}/invoke/${functionName}`,
            method: 'POST',
            body: ask,
            keyConfig: keyConfig
        });
        return result;
    };

    private readonly getResponseAsync = async <T>(request: ServiceRequest): Promise<T> => {
        const { commandPath, method, body, keyConfig } = request;

        const headers: [string, string][] = [
            [SK_HTTP_HEADER_MODEL, keyConfig.deploymentOrModelId],
            [SK_HTTP_HEADER_ENDPOINT, keyConfig.endpoint],
            [SK_HTTP_HEADER_API_KEY, keyConfig.apiKey],
            [SK_HTTP_HEADER_COMPLETION, keyConfig.completionBackend.toString()]
        ];

        const response = await fetch(`${keyConfig.serviceUrl}${commandPath}`, {
            method: method ?? 'GET', 
            headers,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw response.statusText;
        }

        return (await response.json()) as T;
    };
}