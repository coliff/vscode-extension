import { Parser } from 'aurelia-binding';
import { sys } from 'typescript';
import { AuFile } from '../Model/Files/AuFile';
import { HTMLDocumentParser, TagDefinition } from './../Parsers/HTMLDocumentParser';

export class AureliaFileParser {

  public async parse(path: string, content: string): Promise<AuFile> {

    const document = await this.getHtmlDocument(content);

    const auFile = new AuFile();
    auFile.fileName = path;
    auFile.singleFileComponent = path.endsWith('.au');

    if (!auFile.singleFileComponent) {
      const tsPath = path.replace('.html', '.ts');
      const tsContent = sys.readFile(tsPath);
      auFile.typescriptBlocks.push({ code: tsContent, className: 'foo' });
    }

    for (const tagDef of document) {

      if (tagDef.startTag) {

        switch (tagDef.name) {
          case 'template':
            auFile.templateBindings = this.getBindableValuesFrom(tagDef);
            break;
          case 'import':
          case 'require':
            auFile.imports.push(this.processImport(tagDef));
            break;
          case 'script':
            const typeAttribute = tagDef.attributes.find((attr) => attr.name === 'type');

            if (typeAttribute) {
              const scriptType = typeAttribute.value;

              switch (scriptType) {
                case 'application/javascript':
                  auFile.javascriptBlocks.push({ startTag: tagDef });
                  break;
                case 'application/typescript':
                  auFile.typescriptBlocks.push({ startTag: tagDef });
                  break;
              }
            }
            break;
          case 'style':
            // console.log('found style tag');
            break;
          default:
            const commands = tagDef.attributes.filter((attr) => attr.binding);
            const aureliaParser = new Parser();
            for (const command of commands) {
              auFile.commands.push({
                bindingData: aureliaParser.parse(command.value),
                bindingType: command.binding,
                name: command.name,
                value: command.value,
              });
            }
            break;
          }
      } else {

        // closing tags
        switch (tagDef.name) {
          case 'script':
            const lastTypeScriptStartTag = auFile.typescriptBlocks[auFile.typescriptBlocks.length - 1];
            const lastJavaScriptStartTag = auFile.javascriptBlocks[auFile.javascriptBlocks.length - 1];
            if (lastTypeScriptStartTag && !lastTypeScriptStartTag.endTag) {
              lastTypeScriptStartTag.endTag = tagDef;
              lastTypeScriptStartTag.code = content.substring(lastTypeScriptStartTag.startTag.endOffset, tagDef.startOffset);

              const regex = /class (.*) ?{/g;
              const match = regex.exec(lastTypeScriptStartTag.code);
              lastTypeScriptStartTag.className = match[1];

            } else if (lastJavaScriptStartTag && !lastJavaScriptStartTag.endTag) {
              lastJavaScriptStartTag.endTag = tagDef;
              lastJavaScriptStartTag.code = content.substring(lastJavaScriptStartTag.startTag.endOffset, tagDef.startOffset);

            }
            break;
        }
      }

      // string interpolation bindings...
      auFile.stringInterpolation = this.getStringInterpolationBindings(content);

    }

    return auFile;
  }

  private async getHtmlDocument(content) {
    const docParser = new HTMLDocumentParser();
    return await docParser.parse(content);
  }

  private getBindableValuesFrom(templateTag) {
    const bindableAttribute = templateTag.attributes.find((attribute) => attribute.name === 'bindable');
    if (bindableAttribute && bindableAttribute.value) {
      return bindableAttribute.value.split(',').map((i) => i.trim());
    } else {
      return [];
    }
  }

  private processImport(requireElement: TagDefinition) {
    const pathAttribute = requireElement.attributes.find((attr) => attr.name === 'from');
    const asAttribute = requireElement.attributes.find((attr) => attr.name === 'as');
    return { from: pathAttribute.value, as: asAttribute ? asAttribute.value : undefined};
  }

  private getStringInterpolationBindings(fileContent) {
    const bindings = [];
    const aureliaParser = new Parser();
    const interpolationRegex = /\$\{(.*)\}/g;
    let match;
    // tslint:disable-next-line:no-conditional-assignment
    while (match = interpolationRegex.exec(fileContent)) {
      bindings.push({
        bindingData: aureliaParser.parse(match[1]),
        value: match[0],
      });
    }

    return bindings;
  }
}
