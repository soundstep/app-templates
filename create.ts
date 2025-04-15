#!/usr/bin/env -S deno run --allow-read --allow-write

import { copy } from 'jsr:@std/fs/copy';
import { exists } from 'jsr:@std/fs/exists';
import { dirname, fromFileUrl, join } from 'jsr:@std/path';

const main = async () => {
    // Determine the base path (file system path)
    const basePath = import.meta.url.startsWith('file://')
        ? fromFileUrl(dirname(import.meta.url)) // Local execution
        : new URL('.', import.meta.url).pathname; // Remote execution (normalized)

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

    const templatePath = join(basePath, 'templates', templateName);
    const projectPath = join(Deno.cwd(), projectName);

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

if (import.meta.main) {
    await main();
}
