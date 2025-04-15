#!/usr/bin/env -S deno run --allow-read --allow-write

// Local usage: deno run --allow-read --allow-write --allow-net ./create.ts <template-name> [project-name]
// Remote usage: deno run --allow-read --allow-write --allow-net https://raw.githubusercontent.com/soundstep/app-templates/main/create.ts <template-name> [project-name]

import { copy, exists } from 'jsr:@std/fs@^1.0.16';
import { dirname, fromFileUrl, join } from 'jsr:@std/path@^1.0.8';

const main = async () => {
    // Force immediate console output
    console.log("Script started");
    Deno.stderr.writeSync(new TextEncoder().encode("Debug: Script is running\n"));
    
    // Determine if we're running remotely
    const isRemote = !import.meta.url.startsWith('file://');
    Deno.stderr.writeSync(new TextEncoder().encode(`Debug: isRemote = ${isRemote}\n`));

    // Determine the base path (file system path)
    const basePath = isRemote
        ? Deno.cwd() // When remote, use current directory
        : fromFileUrl(dirname(import.meta.url)); // Local execution

    // Use multiple output methods to ensure we see something
    console.log(`Base path: ${basePath}`);
    Deno.stderr.writeSync(new TextEncoder().encode(`Debug: Base path = ${basePath}\n`));
    
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
            console.log(`Fetching template from: ${templateUrl}`);
    
            const response = await fetch(templateUrl);
            const responseText = await response.text();
            
            if (!response.ok) {
                console.error(`Error fetching template: ${response.status} ${response.statusText}`);
                console.error(`Response: ${responseText}`);
                console.error(`Make sure the template "${templateName}" exists in the repository.`);
                
                // List available templates from GitHub
                console.log("Attempting to list available templates from GitHub...");
                const templatesUrl = 
                    "https://api.github.com/repos/soundstep/app-templates/contents/templates?ref=deno-templates";
                const templatesResponse = await fetch(templatesUrl);
                
                if (templatesResponse.ok) {
                    const templates = await templatesResponse.json();
                    console.log("Available templates on GitHub:");
                    for (const template of templates) {
                        if (template.type === "dir") {
                            console.log(`- ${template.name}`);
                        }
                    }
                } else {
                    console.error(`Could not list templates: ${templatesResponse.statusText}`);
                }
                
                Deno.exit(1);
            }
    
            let files;
            try {
                files = JSON.parse(responseText);
            } catch (e) {
                console.error("Failed to parse GitHub API response:", e);
                console.error("Response:", responseText);
                Deno.exit(1);
            }
    
            console.log(`Found ${Array.isArray(files) ? files.length : 0} files in template`);
    
            // Download each file
            if (Array.isArray(files)) {
                for (const file of files) {
                    console.log(`Downloading: ${file.name} from ${file.download_url}`);
                    const fileContent = await fetch(file.download_url);
                    const content = await fileContent.text();
                    const filePath = join(templatePath, file.name);
                    await Deno.writeTextFile(filePath, content);
                    console.log(`Downloaded: ${file.name}`);
                }
            } else {
                console.error("Unexpected response format from GitHub API");
                console.error(files);
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

    console.log(`Template path: ${templatePath}`);
    console.log(`Project path: ${projectPath}`);

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
