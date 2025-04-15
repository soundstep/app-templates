#!/usr/bin/env -S deno run --allow-read --allow-write

import { copy } from '@std/fs/copy';
import { exists } from '@std/fs/exists';
import { join } from '@std/path/join';

const main = async () => {
    const templateName = Deno.args[0];
    const projectName = Deno.args[1] || templateName; // Default project name to template name

    if (!templateName) {
        console.error('Usage: create.ts <template-name> [project-name]');
        console.error('Available templates:');
        for (const entry of Deno.readDirSync('./templates')) {
            if (entry.isDirectory) {
                console.error(`- ${entry.name}`);
            }
        }
        Deno.exit(1);
    }

    const templatePath = join(Deno.cwd(), 'templates', templateName);
    const projectPath = join(Deno.cwd(), projectName);

    if (!await exists(templatePath)) {
        console.error(`Error: Template "${templateName}" not found (github.com/soundstep/app-templates)`);
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
