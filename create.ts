#!/usr/bin/env -S deno run --allow-read --allow-write

// Local usage: deno run --allow-read --allow-write --allow-net ./create.ts <template-name> [project-name]
// Remote usage: deno run --allow-read --allow-write --allow-net https://raw.githubusercontent.com/soundstep/app-templates/main/create.ts <template-name> [project-name]

import { copy, exists } from 'jsr:@std/fs@^1.0.16';
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
                const templatesUrl = 
                    "https://api.github.com/repos/soundstep/app-templates/contents/templates?ref=deno-templates";
                const templatesResponse = await fetch(templatesUrl);
                
                if (templatesResponse.ok) {
                    const templates = await templatesResponse.json();
                    for (const template of templates) {
                        if (template.type === "dir") {
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
    if (isRemote) {
        // Create a temporary directory for the template
        templatePath = join(Deno.cwd(), '.temp-template');
        try {
            await Deno.mkdir(templatePath, { recursive: true });

            // Fetch the template files from GitHub
            const templateUrl =
                `https://api.github.com/repos/soundstep/app-templates/contents/templates/${templateName}?ref=deno-templates`;
            console.log(`Fetching template from GitHub...`);
    
            const response = await fetch(templateUrl);
            
            if (!response.ok) {
                console.error(`Error: Template "${templateName}" not found`);
                
                // List available templates from GitHub
                console.log("Available templates:");
                const templatesUrl = 
                    "https://api.github.com/repos/soundstep/app-templates/contents/templates?ref=deno-templates";
                const templatesResponse = await fetch(templatesUrl);
                
                if (templatesResponse.ok) {
                    const templates = await templatesResponse.json();
                    for (const template of templates) {
                        if (template.type === "dir") {
                            console.log(`- ${template.name}`);
                        }
                    }
                }
                
                Deno.exit(1);
            }
    
            const files = await response.json();
    
            // Download each file
            if (Array.isArray(files)) {
                for (const file of files) {
                    if (!file.download_url) {
                        console.log(`Skipping ${file.name} - no download URL (might be a directory)`);
                        continue;
                    }
                    
                    try {
                        const fileContent = await fetch(file.download_url);
                        const content = await fileContent.text();
                        const filePath = join(templatePath, file.name);
                        await Deno.writeTextFile(filePath, content);
                    } catch (error) {
                        console.error(`Error downloading ${file.name}: ${error}`);
                    }
                }
            } else {
                console.error("Unexpected response format from GitHub API");
                Deno.exit(1);
            }
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
