import * as vscode from 'vscode';
import { IKeyConfig } from './models/KeyConfig';
import { SemanticKernel } from './SemanticKernel';


export function activate(context: vscode.ExtensionContext) {
	// Create a new SKViewProvider instance and register it with the extension's context
	const provider = new SKViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(SKViewProvider.viewType, provider,  {
			webviewOptions: { retainContextWhenHidden: true }
		})
	);

	// Register the commands that can be called from the extension's package.json
	const skillFunctionHandler = (skillName: string, functionName: string) => {
		provider.search("", skillName, functionName);
	};

	const codeAsk = vscode.commands.registerCommand('semanticKernel.codeAsk', () => {
		vscode.window.showInputBox({ prompt: 'What do you want to do?' }).then((value: string | undefined) => {
			if (value !== undefined && value.trim() !== "") {
				provider.search(value, "Code", "Ask");
			}
		});
	});
	
	const codeExplain = vscode.commands.registerCommand('semanticKernel.codeExplain', () => {	
		skillFunctionHandler("Code", "Explain");
	});
	const codeRefactor = vscode.commands.registerCommand('semanticKernel.codeRefactor', () => {
		skillFunctionHandler("Code", "Refactor");
	});
	const codeOptimize = vscode.commands.registerCommand('semanticKernel.codeOptimize', () => {
		skillFunctionHandler("Code", "Optimize");
	});
	const codeProblem = vscode.commands.registerCommand('semanticKernel.codeProblem', () => {
		skillFunctionHandler("Code", "FindProblem");
	});	

	context.subscriptions.push(codeAsk, codeExplain, codeRefactor, codeOptimize, codeProblem);

	// Change the extension's session token when configuration is changed
	vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
		if (event.affectsConfiguration('semanticKernel.apiKey')) {
			// Reload the configuration
			provider.loadConfig();
		} 
		if (event.affectsConfiguration('semanticKernel.deploymentOrModelId')) {
			// Reload the configuration
			provider.loadConfig();
		}
		if (event.affectsConfiguration('semanticKernel.endpoint')) {
			// Reload the configuration
			provider.loadConfig();
		}
		if (event.affectsConfiguration('semanticKernel.isOpenAI')) {
			// Reload the configuration
			provider.loadConfig();
		}
		if (event.affectsConfiguration('semanticKernel.serviceUrl')) {
			// Reload the configuration
			provider.loadConfig();
		}
		if (event.affectsConfiguration('semanticKernel.azureOpenAiEndpoint')) {
			// Reload the configuration
			provider.loadConfig();
		}

		if (event.affectsConfiguration('semanticKernel.selectedInsideCodeblock')) {
			const config = vscode.workspace.getConfiguration('semanticKernel');
			provider.selectedInsideCodeblock = config.get('selectedInsideCodeblock') || false;

		} 
		if (event.affectsConfiguration('semanticKernel.pasteOnClick')) {
			const config = vscode.workspace.getConfiguration('semanticKernel');
			provider.pasteOnClick = config.get('pasteOnClick') || false;

		} 
		if (event.affectsConfiguration('semanticKernel.keepConversation')) {
			const config = vscode.workspace.getConfiguration('semanticKernel');
			provider.keepConversation = config.get('keepConversation') || false;

		}
		if (event.affectsConfiguration('semanticKernel.timeoutLength')) {
			const config = vscode.workspace.getConfiguration('semanticKernel');
			provider.timeoutLength = config.get('timeoutLength') || 60;
		}
	});
}


class SKViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'semanticKernel.chatView';

	private _view?: vscode.WebviewView;

	// This variable holds a reference to the SemanticKernel instance
	private _sk?: SemanticKernel;
	private _prompt?: string;

	public selectedInsideCodeblock = false;
	public pasteOnClick = true;
	public keepConversation = true;
	public timeoutLength = 60;
	private _keyConfig!: IKeyConfig;
	private _fullPrompt?: string;
	private _response?: string;

	// In the constructor, we store the URI of the extension
	constructor(private readonly _extensionUri: vscode.Uri) 
	{
		this.loadConfig();
	}
	
	public loadConfig() {
		const config = vscode.workspace.getConfiguration('semanticKernel');

		this.selectedInsideCodeblock = config.get('selectedInsideCodeblock') || false;
		this.pasteOnClick = config.get('pasteOnClick') || false;
		this.keepConversation = config.get('keepConversation') || false;
		this.timeoutLength = config.get('timeoutLength') || 60;
		
		const isOpenAI = config.get('isOpenAI') as boolean;
		const apiKey = config.get('apiKey') as string|undefined;
		const azureOpenAiEndpoint = config.get('azureOpenAiEndpoint') as string|undefined;
		const serviceUrl = config.get('serviceUrl') as string|undefined;
		const deploymentOrModelId = config.get('deploymentOrModelId') as string|undefined;
	
		this._keyConfig = {
			apiKey: apiKey,
			deploymentOrModelId: deploymentOrModelId,
			endpoint: isOpenAI ? "" : azureOpenAiEndpoint,
			completionBackend: isOpenAI ? 1 : 0,
			serviceUrl: serviceUrl,
		} as IKeyConfig;
	}

	// This private method initializes a new SemanticKernel instance, using the session token if it is set
	private restartSK() {
		this._sk = new SemanticKernel();
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		// set options for the webview
		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		// set the HTML for the webview
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// add an event listener for messages received by the webview
		webviewView.webview.onDidReceiveMessage((data: { type: any; value: string | undefined; }) => {
			switch (data.type) {
				case 'codeSelected':
					{
						// do nothing if the pasteOnClick option is disabled
						if (!this.pasteOnClick) {
							break;
						}

						let code = data.value;
						code = code?.replace(/([^\\])(\$)([^{0-9])/g, "$1\\$$$3");

						// insert the code as a snippet into the active text editor
						vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(code));
						break;
					}
				case 'prompt':
					{
						this.search(data.value, "Code", "Ask");
					}
			}
		});
	}

	public async search(prompt?:string, skillName?: string, functionName?: string) {
		this._prompt = prompt;
		if (!prompt) {
			prompt = '';
		};

		if (!skillName) {
			skillName = "Code";
		};

		if (!functionName) {
			functionName = "Ask";
		};
		// Check if the SemanticKernel instance is defined
		if (!this._sk) {
			this.restartSK();
		}

		// focus gpt activity from activity bar
		if (!this._view) {
			await vscode.commands.executeCommand('semanticKernel.chatView.focus');
		} else {
			this._view?.show?.(true);
		}
		
		let response = '';

		// Get the selected text of the active editor
		const selection = vscode.window.activeTextEditor?.selection;
		const selectedText = vscode.window.activeTextEditor?.document.getText(selection);
		let searchPrompt = '';

		if (selection && selectedText) {
			// If there is a selection, add the prompt and the selected text to the search prompt
			if (this.selectedInsideCodeblock) {
				searchPrompt = `${prompt}\n\`\`\`\n${selectedText}\n\`\`\``;
			} else {
				searchPrompt = `${prompt}\n${selectedText}\n`;
			}
		} else {
			// Otherwise, just use the prompt if user typed it in the context of the whole file
			searchPrompt = prompt;
			searchPrompt += "\n" + vscode.window.activeTextEditor?.document.getText();
		}

		this._fullPrompt = searchPrompt;


		if (!this._sk) {
			response = '[ERROR] Semantic Kernel settings missing';
		} else {
			// If successfully signed in
			console.log("sendMessage");
			
			// Make sure the prompt is shown
			this._view?.webview.postMessage({ type: 'setPrompt', value: this._prompt });

			if (this._view) {
				this._view.webview.postMessage({ type: 'addResponse', value: '...' });
			}

			let agent = this._sk;

			try {
				// Send the search prompt to the SemanticKernel instance and store the response
				var result = await agent.invokeAsync({ value: searchPrompt }, skillName, functionName, this._keyConfig);
				response = result.value;

				if (this._view && this._view.visible) 
				{
					this._view.webview.postMessage({ type: 'addResponse', value: response });
				}

			} catch (e) {
				console.error(e);
				response = `[ERROR] ${e}`;
			}
		}

		// Saves the response
		this._response = response;

		// Show the view and send a message to the webview with the response
		if (this._view) {
			this._view.show?.(true);
			this._view.webview.postMessage({ type: 'addResponse', value: response });
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {

		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const microlightUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'microlight.min.js'));
		const tailwindUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'showdown.min.js'));
		const showdownUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'scripts', 'tailwind.min.js'));

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<script src="${tailwindUri}"></script>
				<script src="${showdownUri}"></script>
				<script src="${microlightUri}"></script>
				<style>
				.code {
					white-space : pre;
				</style>
			</head>
			<body>
				<input class="h-10 w-full text-white bg-stone-700 p-4 text-sm" type="text" id="prompt-input" />

				<div id="response" class="pt-6 text-sm">
				</div>

				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}