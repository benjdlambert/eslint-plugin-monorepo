import moduleVisitor, {
  makeOptionsSchema,
} from 'eslint-module-utils/moduleVisitor';
import parse from 'parse-package-name';
import getPackages from 'get-monorepo-packages';
import path from 'path';
import minimatch from 'minimatch';
import fs from 'fs';

export const meta = {
  schema: [makeOptionsSchema({})],
};

const withoutExtension = (importFile, fileEntry) => {
  const importExt = path.extname(importFile);
  if (importExt !== '') return [importFile, fileEntry];

  const fileEntryExt = path.extname(fileEntry);
  const newFileEntry =
    fileEntryExt !== ''
      ? fileEntry.replace(new RegExp(`\\${fileEntryExt}$`), '')
      : fileEntry;
  return [importFile, newFileEntry];
};

export const create = context => {
  const {
    options: [moduleUtilOptions],
  } = context;
  const packages = getPackages(process.cwd());

  return moduleVisitor(node => {
    const { name, path: internalPath } = tryParse(node.value);
    const matchedPackage = packages.find(pkg => pkg.package.name === name);
    const packageRoot = matchedPackage.location;

    // Need to take care of "files" field, since they are
    // supposed to be part of the public API of the package
    const absolutePathsForFiles =
      matchedPackage.package.files &&
      matchedPackage.package.files.map(file => {
        const fileOrDirOrGlob = path.join(packageRoot, file);

        try {
          if (fs.lstatSync(fileOrDirOrGlob).isDirectory()) {
            return path.join(fileOrDirOrGlob, '**', '*');
          }
          return fileOrDirOrGlob;
        } catch (e) {
          return fileOrDirOrGlob;
        }
      });
    const absoluteInternalPath = path.join(packageRoot, internalPath);

    if (!internalPath) return;
    if (!matchedPackage) return;
    if (absolutePathsForFiles) {
      const isImportWithinFiles = absolutePathsForFiles.some(maybeGlob => {
        // If import doesn't have an extension, strip it from the file entry
        const [theImport, theFileEntry] = withoutExtension(
          absoluteInternalPath,
          maybeGlob
        );
        return minimatch(theImport, theFileEntry);
      });

      if (isImportWithinFiles) return;
    }

    context.report({
      node,
      message: `Import for monorepo package '${name}' is internal.`,
    });
  }, moduleUtilOptions);
};

const tryParse = text => {
  try {
    return parse(text);
  } catch (error) {
    return { path: text, name: '' };
  }
};
