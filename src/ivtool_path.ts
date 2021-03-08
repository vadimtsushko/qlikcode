import * as vscode from 'vscode';
let ivtoolPath: string;
export function setInternalIvtoolPath(defaultPath: string): void {
    ivtoolPath = defaultPath;
    console.log(ivtoolPath);
} 
export function getIvtoolPath(): string {
    var useExternalIvtool = vscode.workspace.getConfiguration().get('infovizion.1.useExternalIvtool',false);
	if (useExternalIvtool) {
		return 'ivtool';
	}
    return ivtoolPath;
}