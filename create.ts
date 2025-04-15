#!/usr/bin/env -S deno run --allow-read --allow-write

// Local usage: deno run --allow-read --allow-write ./create.ts <template-name> [project-name]
// Remote usage: deno run --allow-read --allow-write https://raw.githubusercontent.com/soundstep/app-templates/main/create.ts <template-name> [project-name]

import { copy, exists } from 'jsr:@std/fs@^1.0.16';
import { dirname, fromFileUrl, join } from 'jsr:@std/path@^1.0.8';

const main = async () => {
    // Determine the base path (file system path)
    const basePath = import.meta.url.startsWith('file://')
        ? fromFileUrl(dirname(import.meta.url)) // Local execution
        : new URL('.', import.meta.url).pathname; // Remote execution (normalized)

    console.log(`Base path: ${basePath}`);
    
    const templateName = Deno.args[0];
    const projectName = Deno.args[1] || templateName;

    if (!templateName) {
        console.error('Usage: create.ts <template-name> [project-name]');
        console.error('Available templates:');
        for (const entry of Deno.readDirSync(join(basePath, 'templates'))) {
            if (entry.isDirectory) {
                console.error(`- ${entry.name}`);
            }
        }
        Deno.exit(1);
    }

    // Log available templates for debugging
    console.log('Available templates:');
    try {
        for (const entry of Deno.readDirSync(join(basePath, 'templates'))) {
            if (entry.isDirectory) {
                console.log(`- ${entry.name}`);
            }
        }
    } catch (error) {
        console.error(`Error reading templates directory: ${error}`);
        console.error(`Templates path: ${join(basePath, 'templates')}`);
    }

    const templatePath = join(basePath, 'templates', templateName);
    const projectPath = join(Deno.cwd(), projectName);

    console.log(`Template path: ${templatePath}`);
    console.log(`Project path: ${projectPath}`);

    if (!await exists(templatePath)) {
        console.error(`Error: Template "${templateName}" not found`);
        Deno.exit(1);
    }

    if (await exists(projectPath)) {
        console.warn(`Warning: Directory "${projectName}" already exists. Files might be overwritten.`);
        const overwrite = confirm('Do you want to overwrite existing files? (y/N)');
        if (!overwrite) {
            console.log('Aborting.');
            Deno.exit(0);
        }
    } else {
        await Deno.mkdir(projectPath, { recursive: true });
    }

    try {
        console.log(`Copying template "${templateName}" to "${projectName}"...`);
        await copy(templatePath, projectPath, { overwrite: true });
        console.log(`Project "${projectName}" created successfully!`);
        console.log(`Navigate to the project: cd ${projectName}`);
    } catch (error) {
        console.error('Error copying template:', error);
        Deno.exit(1);
    }
};

// Make sure to call main() at the end of the file
if (import.meta.main) {
    await main();
}
