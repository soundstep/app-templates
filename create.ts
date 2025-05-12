#!/usr/bin/env -S deno run --allow-read --allow-write

// Local usage: deno run --allow-read --allow-write --allow-net ./create.ts <template-name> [project-name]
// Remote usage: deno run --allow-read --allow-write --allow-net https://raw.githubusercontent.com/soundstep/app-templates/refs/heads/main/create.ts <template-name> [project-name]

import { ensureDir, exists } from 'jsr:@std/fs@^1.0.16';
import { dirname, fromFileUrl, join } from 'jsr:@std/path@^1.0.8';
import { bold, yellow } from 'jsr:@std/fmt@^1.0.7/colors';

// Types
type TemplateSource = 'github' | 'local';

interface CliOptions {
  templateName: string;
  projectName: string;
  isCurrentDir: boolean;
}

// Configuration
const GITHUB_REPO = 'soundstep/app-templates';
const TEMPLATES_DIR = 'templates';

/**
 * Lists files that will be created and their backup paths if they will be overwritten
 */
async function listFilesAndCheckOverlap(templateDir: string, projectDir: string, relativePath = '') {
  try {
    for await (const entry of Deno.readDir(join(templateDir, relativePath))) {
      const itemRelativePath = join(relativePath, entry.name);
      const targetPath = join(projectDir, itemRelativePath);
      const willOverride = await exists(targetPath);

      if (entry.isDirectory) {
        // Don't mark directories, just display them
        console.log(`  📁 ${itemRelativePath}/`);
        await listFilesAndCheckOverlap(templateDir, projectDir, itemRelativePath);
      } else {
        // For files that will be overwritten, show backup path
        if (willOverride) {
          // Show the file and its backup path
          const backupPath = `${itemRelativePath}.backup`;
          console.log(`${yellow(bold('!'))} 📄 ${yellow(`${itemRelativePath} -> ${backupPath}`)}`);
        } else {
          console.log(`  📄 ${itemRelativePath}`);
        }
      }
    }
  } catch (error) {
    console.error(`Error listing files: ${error}`);
  }
}

/**
 * Copies files individually from source to destination, preserving existing files
 * that are not being replaced and creating backups of overwritten files.
 */
async function copyFilesIndividually(src: string, dest: string, relativePath = '') {
  try {
    for await (const entry of Deno.readDir(join(src, relativePath))) {
      const srcPath = join(src, relativePath, entry.name);
      const destPath = join(dest, relativePath, entry.name);

      if (entry.isDirectory) {
        // Create directory if it doesn't exist
        await ensureDir(destPath);
        // Process the directory contents
        await copyFilesIndividually(
          src,
          dest,
          join(relativePath, entry.name),
        );
      } else {
        // Copy the file
        await ensureDir(dirname(destPath));
        // Check if file exists and create a backup if needed
        const fileExists = await exists(destPath);
        if (fileExists) {
          try {
            const backupPath = `${destPath}.backup`;
            await Deno.copyFile(destPath, backupPath);
            const relativeFilePath = relativePath ? join(relativePath, entry.name) : entry.name;
            const relativeBackupPath = `${relativeFilePath}.backup`;
            console.log(`${yellow(bold('Created backup:'))} ${yellow(`${relativeFilePath} -> ${relativeBackupPath}`)}`);
          } catch (backupError) {
            console.error(`Error creating backup: ${backupError}`);
          }
        }
        
        // Now copy the file (removing existing one if needed)
        try {
          if (fileExists) {
            await Deno.remove(destPath);
          }
          await Deno.copyFile(srcPath, destPath);
        } catch (error) {
          console.error(`Error copying file ${srcPath} to ${destPath}: ${error}`);
          throw error;
        }
      }
    }
  } catch (error) {
    console.error(`Error copying files: ${error}`);
    throw error;
  }
}

/**
 * Downloads a file or directory from GitHub
 */
async function downloadFromGitHub(repoPath: string, localPath: string, branch = 'main') {
  // Ensure the local path exists
  await ensureDir(localPath);
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${repoPath}?ref=${branch}`;
  const response = await fetch(url);

  if (!response.ok) {
    console.error(`Error fetching ${repoPath}: ${response.status} ${response.statusText}`);
    // Exit with error code when template is not found
    if (repoPath.startsWith(`${TEMPLATES_DIR}/`) && response.status === 404) {
      console.error(`Template not found`);
      Deno.exit(1);
    }
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
      await ensureDir(itemPath);
      await downloadFromGitHub(`${repoPath}/${item.name}`, itemPath, 'main');
    } else if (item.type === 'file') {
      // Download file
      try {
        // Ensure parent directory exists
        await ensureDir(dirname(itemPath));

        // Check if file exists and create a backup if needed
        const fileExists = await exists(itemPath);
        if (fileExists) {
          try {
            const backupPath = `${itemPath}.backup`;
            await Deno.copyFile(itemPath, backupPath);
            console.log(`${yellow(bold('Created backup:'))} ${yellow(`${itemPath} -> ${backupPath}`)}`);
          } catch (backupError) {
            console.error(`Error creating backup: ${backupError}`);
          }
        }

        // Download and write the file (removing existing if needed)
        try {
          const fileContent = await fetch(item.download_url);
          const content = await fileContent.text();
          if (fileExists) {
            await Deno.remove(itemPath);
          }
          await Deno.writeTextFile(itemPath, content);
        } catch (writeError) {
          console.error(`Error writing file ${item.name}: ${writeError}`);
          throw writeError;
        }
      } catch (error) {
        console.error(`Error downloading ${item.name}: ${error}`);
      }
    }
  }
}

/**
 * Lists available templates from GitHub or local filesystem
 */
async function listTemplates(source: TemplateSource, basePath: string) {
  console.log('Available templates:');

  if (source === 'github') {
    try {
      const templatesUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${TEMPLATES_DIR}?ref=main`;
      const templatesResponse = await fetch(templatesUrl);

      if (templatesResponse.ok) {
        const templates = await templatesResponse.json();
        for (const template of templates) {
          if (template.type === 'dir') {
            console.log(`- ${template.name}`);
          }
        }
      } else {
        console.error(`Could not list templates: ${templatesResponse.statusText}`);
      }
    } catch (error) {
      console.error(`Error listing templates: ${error}`);
    }
  } else {
    try {
      for (const entry of Deno.readDirSync(join(basePath, TEMPLATES_DIR))) {
        if (entry.isDirectory) {
          console.log(`- ${entry.name}`);
        }
      }
    } catch (error) {
      console.error(`Error listing templates: ${error}`);
    }
  }
}

/**
 * Fetches a template from GitHub or local filesystem
 */
async function fetchTemplate(templateName: string, isRemote: boolean, basePath: string): Promise<string> {
  let templatePath: string;
  
  if (isRemote) {
    // Create a temporary directory for the template using Deno's temp directory
    templatePath = Deno.makeTempDirSync({ prefix: 'app-templates-' });
    await ensureDir(templatePath);
    try {
      console.log(`Fetching template from GitHub...`);
      await downloadFromGitHub(`${TEMPLATES_DIR}/${templateName}`, templatePath, 'main');
    } catch (error) {
      console.error(`Error fetching template: ${error}`);
      Deno.exit(1);
    }
  } else {
    templatePath = join(basePath, TEMPLATES_DIR, templateName);
    if (!await exists(templatePath)) {
      console.error(`Error: Template "${templateName}" not found`);
      Deno.exit(1);
    }
  }
  
  return templatePath;
}

/**
 * Creates a project from a template
 */
async function createProject(templatePath: string, projectPath: string, options: CliOptions) {
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
      // Compare files in the template with files in the target directory
      console.warn(`Warning: Directory "${options.projectName}" is not empty.`);
      console.log(`The following files will be created (${yellow(bold('!'))} = will create a backup of existing files):`);

      // List all files from the template and check which ones will be overridden
      await listFilesAndCheckOverlap(templatePath, projectPath);

      const proceed = confirm('Do you want to proceed?');
      if (!proceed) {
        console.log('Aborting.');
        Deno.exit(0);
      }
    }
  } else {
    await Deno.mkdir(projectPath, { recursive: true });
  }

  try {
    console.log(`Copying template "${options.templateName}" to "${options.projectName}"...`);
    await copyFilesIndividually(templatePath, projectPath);
    console.log(`Project "${options.projectName}" created successfully!`);

    // Only show navigation message if not in current directory
    if (!options.isCurrentDir) {
      console.log(`Navigate to the project: cd ${options.projectName}`);
    }
  } catch (error) {
    console.error('Error copying template:', error);
    Deno.exit(1);
  }
}

/**
 * Parses command-line arguments
 */
function parseCliArguments(): CliOptions {
  const templateName = Deno.args[0];
  let projectName = Deno.args[1] || templateName;

  // Normalize project name to handle various current directory references
  const isCurrentDir = projectName === '.' || projectName === './' || projectName === '' || projectName === Deno.cwd();
  if (isCurrentDir) {
    projectName = '.';
  }

  return {
    templateName,
    projectName,
    isCurrentDir,
  };
}

/**
 * Displays usage information
 */
function showUsage(source: TemplateSource, basePath: string, commandName: string) {
  console.error(`Usage: ${commandName} <template-name> [project-name]`);
  console.error(`       ${commandName} list`);
  console.error('Available templates:');

  if (source === 'github') {
    // For remote execution, list templates from GitHub
    try {
      const templatesUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${TEMPLATES_DIR}?ref=main`;
      const templatesResponse = fetch(templatesUrl);
      
      templatesResponse.then((response) => {
        if (response.ok) {
          response.json().then((templates) => {
            for (const template of templates) {
              if (template.type === 'dir') {
                console.error(`- ${template.name}`);
              }
            }
          });
        } else {
          console.error(`Could not list templates: ${response.statusText}`);
        }
      }).catch((error) => {
        console.error(`Error listing templates: ${error}`);
      });
    } catch (error) {
      console.error(`Error listing templates: ${error}`);
    }
  } else {
    // For local execution, list templates from filesystem
    try {
      for (const entry of Deno.readDirSync(join(basePath, TEMPLATES_DIR))) {
        if (entry.isDirectory) {
          console.error(`- ${entry.name}`);
        }
      }
    } catch (error) {
      console.error(`Error listing templates: ${error}`);
    }
  }
}

/**
 * Main application function
 */
async function main() {
  // Determine if we're running remotely
  const isRemote = !import.meta.url.startsWith('file://');
  const source: TemplateSource = isRemote ? 'github' : 'local';

  // Determine the base path (file system path)
  const basePath = isRemote
    ? Deno.cwd() // When remote, use current directory
    : fromFileUrl(dirname(import.meta.url)); // Local execution

  // Parse command-line arguments
  const options = parseCliArguments();

  // Handle the "list" command to show available templates
  if (options.templateName === 'list') {
    await listTemplates(source, basePath);
    Deno.exit(0);
  }

  if (!options.templateName) {
    // Get the command name based on how the script is being run
    const commandName = import.meta.url.includes('atpl') ? 'atpl' : 'create.ts';
    showUsage(source, basePath, commandName);
    Deno.exit(1);
  }

  // Fetch the template
  const templatePath = await fetchTemplate(options.templateName, isRemote, basePath);
  
  // Determine the project path
  const projectPath = join(Deno.cwd(), options.projectName);
  
  // Create the project
  await createProject(templatePath, projectPath, options);

  // Clean up temp directory if remote
  if (isRemote) {
    try {
      await Deno.remove(templatePath, { recursive: true });
    } catch (error) {
      console.error(`Warning: Could not clean up temporary files: ${error}`);
    }
  }
}

// Execute main function when run directly
if (import.meta.main) {
  await main();
}