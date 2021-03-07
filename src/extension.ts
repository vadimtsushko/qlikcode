/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import { PreviewManager } from './preview';
import { setInternalIvtoolPath } from './ivtool_path';

import { getIvtoolPath } from './ivtool_path';
interface InfovizoinTaskDefinition extends vscode.TaskDefinition {}
let kind: InfovizoinTaskDefinition = {
	type: 'shell'
};
let taskProvider: vscode.Disposable | undefined;
export function activate(_context: vscode.ExtensionContext): void {
	console.log('Congratulations, your extension "Infovizion" is now active!');
	setInternalIvtoolPath(_context.extensionUri.fsPath + '/dist/windows/ivtool.exe');

	
	const previewManager = new PreviewManager(_context.extensionUri);
	_context.subscriptions.push(vscode.window.registerCustomEditorProvider(PreviewManager.viewType, previewManager, {
		supportsMultipleEditorsPerDocument: true,
	}))
	_registerCommand(_context, 'infovizion-tools.expressions_to_json', () => {	
		inqlikEditorTask( ['expression', 'convert-to-json'],'Qlik Expression. Convert to JSON');
	});
	_registerCommand(_context, 'infovizion-tools.expressions_migrate', () => {	
		inqlikEditorTask( ['expression', 'migrate'],'Qlik Expression. Migrate file to new format (App.variables)');
	});
	_registerCommand(_context, 'infovizion-tools.qvs_check', () => {	
		qvsEditorTask( ['qvs', '--command', 'check'],'Check Qlik load script for errors');
	});
	_registerCommand(_context, 'infovizion-tools.qvs_open', () => {	
		qvsEditorTask( ['qvs', '--command', 'open'],'Open qvw file');
	});
	_registerCommand(_context, 'infovizion-tools.qvs_run', () => {	
		qvsEditorTask( [],'Run default task for qvs script');
	});
	_registerCommand(_context, 'infovizion-tools.qvs_log', ()=> openLogFile());
	vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
		onDidSaveTextDocument(document);
	});
}

export function deactivate(): void {
	if (taskProvider) {
		taskProvider.dispose();
	}
}

function onDidSaveTextDocument(document: vscode.TextDocument) {
  let filePath = document.fileName;
  if (filePath.endsWith('.qlikview-vars')) {
  let args = ['expression', 'convert-to-json', '--simple',filePath];
  let description = 'Qlik Expression. Convert to JSON';
  let task = new vscode.Task(kind, vscode.TaskScope.Global, description, 'qlik-expressions', new vscode.ProcessExecution(getIvtoolPath(), args),
		'$qlik-expressions'); 
	vscode.tasks.executeTask(task);

  }
}
function inqlikEditorTask(args: string[], description: string) {
	let textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) {
		return;
	}
	let filePath = textEditor.document.fileName;
	args.push(filePath);
	let task = new vscode.Task(kind, vscode.TaskScope.Global, description, 'qlik-expressions', new vscode.ProcessExecution(getIvtoolPath(), args),
		'$qlik-expressions');
	vscode.tasks.executeTask(task);
}
function qvsEditorTask(args: string[], description: string) {
	if (args.length == 0) {
		var runCommandParam = vscode.workspace.getConfiguration().get('infovizion.runCommand','just_reload');
        args = ['qvs', '--command', runCommandParam];
	}

	let textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) {
		return;
	}
	let filePath = textEditor.document.fileName;
	if (vscode.workspace.getConfiguration().get('infovizion.suppressErrorCodes')) {
	  args.push('--suppress-error-codes');
	}
	var senseMode = vscode.workspace.getConfiguration().get('infovizion.sense.senseMode');
	console.log(`qvsEditorTask ${senseMode}`);
	if (senseMode) {
		args.push('--sense-mode');
		var value = vscode.workspace.getConfiguration().get('infovizion.sense.host'); 
		if (`${value}`.trim() !== '') {
		  args.push('--sense-host')
		  args.push(`${value}`);
		}
		value = vscode.workspace.getConfiguration().get('infovizion.sense.port'); 
		args.push('--sense-port')
		args.push(`${value}`);
		value = vscode.workspace.getConfiguration().get('infovizion.sense.userDir'); 
		if (`${value}`.trim() !== '') {
		  args.push('--sense-user-dir')
		  args.push(`${value}`);
		}
		value = vscode.workspace.getConfiguration().get('infovizion.sense.userId');
		if (`${value}`.trim() !== '') {
		  args.push('--sense-user-id')
		  args.push(`${value}`);
		}
		value = vscode.workspace.getConfiguration().get('infovizion.sense.logDir');
		args.push('--sense-log-dir')
		args.push(`${value}`);
		value = vscode.workspace.getConfiguration().get('infovizion.sense.logArchivedDir');
		args.push('--sense-log-archived-dir')
		args.push(`${value}`);
		value = vscode.workspace.getConfiguration().get('infovizion.sense.sertificatesDir');
		args.push('--sense-sertificates-dir')
		args.push(`${value}`);
		value = vscode.workspace.getConfiguration().get('infovizion.sense.etlMapDir');
		args.push('--sense-etl-map-dir')
		args.push(`${value}`);
       
	} else {
	  var newFileTemplatePath = vscode.workspace.getConfiguration().get('infovizion.qvwTemplate','c:\\programs\\bin\\_newFileTemplate.qvw');
	  if (fs.existsSync(newFileTemplatePath)) {
		args.push('--qvw-template')
		args.push(newFileTemplatePath);
	  }
	}
	args.push(filePath);
	let task = new vscode.Task(kind, vscode.TaskScope.Global, description, 'qvs', new vscode.ProcessExecution(getIvtoolPath(), args),
		'$qlik');
	vscode.tasks.executeTask(task);
}
function _registerCommand(_context: vscode.ExtensionContext, commandId: string, callback: (...args: any[]) => any, thisArg?: any) {
	let command = vscode.commands.registerCommand(commandId, callback);
	_context.subscriptions.push(command);
}

function openLogFile(): void {
   let textEditor = vscode.window.activeTextEditor;
   if (textEditor === undefined) {
	return;
   }
   var logFileName = path.basename(textEditor.document.fileName).toUpperCase().replace('.QVS','.qvw.log');
   var senseMode = vscode.workspace.getConfiguration().get('infovizion.sense.senseMode');
   var appDir = 'logs';
   if (!senseMode) {
	var firstLine = textEditor.document.lineAt(0).text.trim();
	if (firstLine.startsWith('//#!')) {
		appDir = firstLine.replace('//#!','');
	} else {
		appDir = '';
	}
   }
	var logPath = path.normalize(path.join(path.dirname(textEditor.document.fileName), appDir, logFileName)).toLowerCase();
	console.log(logPath);
    vscode.workspace.openTextDocument(logPath).then((a: vscode.TextDocument) => {
    vscode.window.showTextDocument(a, 1, false).then(e => {
    });
}, (error: any) => {
    console.error(error);
});
}

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('Infovizion tasks');
	}
	return _channel;
}

	/**
	 * The task name
	 */
	// task: string;

	/**
	 * The rake file containing the task
	 */
	// file?: string;

// const buildNames: string[] = ['build', 'compile', 'watch'];
// function isBuildTask(name: string): boolean {
// 	for (let buildName of buildNames) {
// 		if (name.indexOf(buildName) !== -1) {
// 			return true;
// 		}
// 	}
// 	return false;
// }

// const testNames: string[] = ['test'];
// function isTestTask(name: string): boolean {
// 	for (let testName of testNames) {
// 		if (name.indexOf(testName) !== -1) {
// 			return true;
// 		}
// 	}
// 	return false;
// }

// async function getInfovizionTasks(): Promise<vscode.Task[]> {
// 	// let workspaceRoot = vscode.workspace.rootPath;
// 	let result: vscode.Task[] = [];
// 	let kind: InfovizoinTaskDefinition = {
// 		type: 'process'
// 	};

// 	let task = new vscode.Task(kind, 'Qlik Expression. Convert to JSON', 'qlik-expression', new vscode.ProcessExecution('inqlik', ['expression convert-to-json', '$file']),
// 		'$qlik-expressions');
// 	return result;
// }

// function getWebviewContent(fileName: string) {
// }