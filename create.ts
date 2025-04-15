#!/usr/bin/env -S deno run --allow-read --allow-write

// Local usage: deno run --allow-read --allow-write --allow-net ./create.ts <template-name> [project-name]
// Remote usage: deno run --allow-read --allow-write --allow-net https://raw.githubusercontent.com/soundstep/app-templates/refs/heads/main/create.ts <template-name> [project-name]

import { copy, exists, emptyDir } from 'jsr:@std/fs@^1.0.16';
import { dirname, fromFileUrl, join } from 'jsr:@std/path@^1.0.8';

const main = async () => {
    // Determine if we're running remotely
    const isRemote = !import.meta.url.startsWith('file://');

    // Determine the base path (file system path)
    const basePath = isRemote
        ? Deno.cwd() // When remote, use current directory
        : fromFileUrl(dirname(import.meta.url)); // Local execution

    const templateName = Deno.args[0];
    const projectName = Deno.args[1] || templateName;

    if (!templateName) {
        console.error('Usage: create.ts <template-name> [project-name]');
        console.error('Available templates:');

        if (isRemote) {
            // For remote execution, list templates from GitHub
            try {
                const templatesUrl = 'https://api.github.com/repos/soundstep/app-templates/contents/templates?ref=deno-templates';
                const templatesResponse = await fetch(templatesUrl);

                if (templatesResponse.ok) {
                    const templates = await templatesResponse.json();
                    for (const template of templates) {
                        if (template.type === 'dir') {
                            console.error(`- ${template.name}`);
                        }
                    }
                } else {
                    console.error(`Could not list templates: ${templatesResponse.statusText}`);
                }
            } catch (error) {
                console.error(`Error listing templates: ${error}`);
            }
        } else {
            // For local execution, list templates from filesystem
            for (const entry of Deno.readDirSync(join(basePath, 'templates'))) {
                if (entry.isDirectory) {
                    console.error(`- ${entry.name}`);
                }
            }
        }

        Deno.exit(1);
    }

    // For remote execution, we need to fetch the template from GitHub
    let templatePath;
    // Add a recursive function to download files and directories
    async function downloadFromGitHub(repoPath: string, localPath: string, branch = 'deno-templates') {
        const url = `https://api.github.com/repos/soundstep/app-templates/contents/${repoPath}?ref=${branch}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Error fetching ${repoPath}: ${response.status} ${response.statusText}`);
            return;
        }

        const items = await response.json();

        if (!Array.isArray(items)) {
            console.error(`Unexpected response format for ${repoPath}`);
            return;
        }

        for (const item of items) {
            const itemPath = join(localPath, item.name);

            if (item.type === 'dir') {
                // Create directory and recursively download its contents
                await Deno.mkdir(itemPath, { recursive: true });
                await downloadFromGitHub(`${repoPath}/${item.name}`, itemPath, branch);
            } else if (item.type === 'file') {
                // Download file
                try {
                    const fileContent = await fetch(item.download_url);
                    const content = await fileContent.text();
                    await Deno.writeTextFile(itemPath, content);
                } catch (error) {
                    console.error(`Error downloading ${item.name}: ${error}`);
                }
            }
        }
    }

    // Replace the file download section with the recursive function
    if (isRemote) {
        // Create a temporary directory for the template using Deno's temp directory
        templatePath = Deno.makeTempDirSync({ prefix: 'app-templates-' });
        try {
            console.log(`Fetching template from GitHub...`);

            // Use the recursive function to download the template
            await downloadFromGitHub(`templates/${templateName}`, templatePath);
        } catch (error) {
            console.error(`Error fetching template: ${error}`);
            Deno.exit(1);
        }
    } else {
        templatePath = join(basePath, 'templates', templateName);
    }

    const projectPath = join(Deno.cwd(), projectName);

    if (!isRemote && !await exists(templatePath)) {
        console.error(`Error: Template "${templateName}" not found`);
        Deno.exit(1);
    }

    // Check if directory exists
    if (await exists(projectPath)) {
        // Check if directory is empty
        let isEmpty = true;
        try {
            for await (const _ of Deno.readDir(projectPath)) {
                isEmpty = false;
                break;
            }
        } catch (error) {
            console.error(`Error checking directory: ${error}`);
            Deno.exit(1);
        }
    
        if (!isEmpty) {
            // Only ask for confirmation if directory is not empty
            console.warn(`Warning: Directory "${projectName}" is not empty. Files will be deleted.`);
            const proceed = confirm('Do you want to proceed? (y/N)');
            if (!proceed) {
                console.log('Aborting.');
                Deno.exit(0);
            }
            await emptyDir(projectPath);
        }
    } else {
        await Deno.mkdir(projectPath, { recursive: true });
    }

    try {
        console.log(`Copying template "${templateName}" to "${projectName}"...`);
        await copy(templatePath, projectPath, { overwrite: true });
        console.log(`Project "${projectName}" created successfully!`);
        
        // Only show navigation message if not in current directory
        if (projectName !== '.') {
            console.log(`Navigate to the project: cd ${projectName}`);
        }
    } catch (error) {
        console.error('Error copying template:', error);
        Deno.exit(1);
    }

    // Clean up temp directory if remote
    if (isRemote) {
        try {
            await Deno.remove(templatePath, { recursive: true });
        } catch (error) {
            console.error(`Warning: Could not clean up temporary files: ${error}`);
        }
    }
};

// Make sure to call main() at the end of the file
if (import.meta.main) {
    await main();
}
