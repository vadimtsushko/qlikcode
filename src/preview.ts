/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './dispose';
import * as cp from 'child_process';

export class PreviewManager implements vscode.CustomReadonlyEditorProvider {

	public static readonly viewType = 'qvdPreview.previewEditor';

	private readonly _previews = new Set<Preview>();
	private _activePreview: Preview | undefined;

	constructor(
		private readonly extensionRoot: vscode.Uri,
	) { }

	public async openCustomDocument(uri: vscode.Uri) {
		return { uri, dispose: () => { } };
	}

	public async resolveCustomEditor(
		document: vscode.CustomDocument,
		webviewEditor: vscode.WebviewPanel,
	): Promise<void> {
		const preview = new Preview(this.extensionRoot, document.uri, webviewEditor);
		this._previews.add(preview);
		this.setActivePreview(preview);

		webviewEditor.onDidDispose(() => { this._previews.delete(preview); });

		webviewEditor.onDidChangeViewState(() => {
			if (webviewEditor.active) {
				this.setActivePreview(preview);
			} else if (this._activePreview === preview && !webviewEditor.active) {
				this.setActivePreview(undefined);
			}
		});
	}

	public get activePreview() { return this._activePreview; }

	private setActivePreview(value: Preview | undefined): void {
		this._activePreview = value;
		this.setPreviewActiveContext(!!value);
	}

	private setPreviewActiveContext(value: boolean) {
		vscode.commands.executeCommand('setContext', 'imagePreviewFocus', value);
	}
}

const enum PreviewState {
	Disposed,
	Visible,
	Active,
}

class Preview extends Disposable {

	private readonly id: string = `${Date.now()}-${Math.random().toString()}`;

	private _previewState = PreviewState.Visible;
	private _imageSize: string | undefined;
	private _imageBinarySize: number | undefined;

	private readonly emptyPngDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42gEFAPr/AP///wAI/AL+Sr4t6gAAAABJRU5ErkJggg==';

	constructor(
		private readonly extensionRoot: vscode.Uri,
		private readonly resource: vscode.Uri,
		private readonly webviewEditor: vscode.WebviewPanel,
	) {
		super();
		const resourceRoot = resource.with({
			path: resource.path.replace(/\/[^\/]+?\.\w+$/, '/'),
		});

		webviewEditor.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				resourceRoot,
				extensionRoot,
			]
		};

		// this._register(webviewEditor.webview.onDidReceiveMessage(message => {
		// 	switch (message.type) {
		// 		case 'size':
		// 			{
		// 				this._imageSize = message.value;
		// 				this.update();
		// 				break;
		// 			}
		// 		case 'zoom':
		// 			{
		// 				this._imageZoom = message.value;
		// 				this.update();
		// 				break;
		// 			}

		// 		case 'reopen-as-text':
		// 			{
		// 				vscode.commands.executeCommand('vscode.openWith', resource, 'default', webviewEditor.viewColumn);
		// 				break;
		// 			}
		// 	}
		// }));

		// this._register(zoomStatusBarEntry.onDidChangeScale(e => {
		// 	if (this._previewState === PreviewState.Active) {
		// 		this.webviewEditor.webview.postMessage({ type: 'setScale', scale: e.scale });
		// 	}
		// }));

		this._register(webviewEditor.onDidChangeViewState(() => {
			this.update();
			this.webviewEditor.webview.postMessage({ type: 'setActive', value: this.webviewEditor.active });
		}));

		this._register(webviewEditor.onDidDispose(() => {
			if (this._previewState === PreviewState.Active) {
			}
			this._previewState = PreviewState.Disposed;
		}));

		const watcher = this._register(vscode.workspace.createFileSystemWatcher(resource.fsPath));
		this._register(watcher.onDidChange(e => {
			if (e.toString() === this.resource.toString()) {
				this.render();
			}
		}));
		this._register(watcher.onDidDelete(e => {
			if (e.toString() === this.resource.toString()) {
				this.webviewEditor.dispose();
			}
		}));

		vscode.workspace.fs.stat(resource).then(({ size }) => {
			this._imageBinarySize = size;
			this.update();
		});

		this.render();
		this.update();
		this.webviewEditor.webview.postMessage({ type: 'setActive', value: this.webviewEditor.active });
	}

	public zoomIn() {
		if (this._previewState === PreviewState.Active) {
			this.webviewEditor.webview.postMessage({ type: 'zoomIn' });
		}
	}

	public zoomOut() {
		if (this._previewState === PreviewState.Active) {
			this.webviewEditor.webview.postMessage({ type: 'zoomOut' });
		}
	}

	private async render() {
		if (this._previewState !== PreviewState.Disposed) {
			this.webviewEditor.webview.html = await this.getWebviewContents();
		}
	}

	private update() {
		if (this._previewState === PreviewState.Disposed) {
			return;
		}

		if (this.webviewEditor.active) {
			this._previewState = PreviewState.Active;
		} else {
			if (this._previewState === PreviewState.Active) {
			}
			this._previewState = PreviewState.Visible;
		}
	}

	private async getWebviewContents(): Promise<string> {
		const version = Date.now().toString();
		const settings = {
			isMac: process.platform === 'darwin',
			src: await this.getResourcePath(this.webviewEditor, this.resource, version),
		};
        let commandLine = `ivtool qvd --format html ${this.resource.fsPath}`;
		console.log(commandLine);
		let content = cp.execSync(commandLine, { encoding: 'utf8' });
		console.log(content);
		return content;
	}

	private async getResourcePath(webviewEditor: vscode.WebviewPanel, resource: vscode.Uri, version: string): Promise<string> {
		if (resource.scheme === 'git') {
			const stat = await vscode.workspace.fs.stat(resource);
			if (stat.size === 0) {
				return this.emptyPngDataUri;
			}
		}

		// Avoid adding cache busting if there is already a query string
		if (resource.query) {
			return webviewEditor.webview.asWebviewUri(resource).toString();
		}
		return webviewEditor.webview.asWebviewUri(resource).with({ query: `version=${version}` }).toString();
	}

	private extensionResource(path: string) {
		return this.webviewEditor.webview.asWebviewUri(this.extensionRoot.with({
			path: this.extensionRoot.path + path
		}));
	}
}

function escapeAttribute(value: string | vscode.Uri): string {
	return value.toString().replace(/"/g, '&quot;');
}
