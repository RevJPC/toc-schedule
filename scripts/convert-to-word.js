const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } = require('docx');

// Read the markdown file
const mdPath = 'C:\\Users\\jamie\\.gemini\\antigravity\\brain\\3fc2334a-6f03-46f0-970d-6e7e6ce410d6\\database_schema.md';
const outputPath = path.join(__dirname, '..', 'database_schema.docx');

const mdContent = fs.readFileSync(mdPath, 'utf8');

// Simple markdown to docx converter
function convertMarkdownToDocx(markdown) {
    const lines = markdown.split('\n');
    const children = [];
    let inCodeBlock = false;
    let codeBlockContent = [];
    let inTable = false;
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Handle code blocks
        if (line.startsWith('```')) {
            if (inCodeBlock) {
                // End code block
                children.push(
                    new Paragraph({
                        children: [new TextRun({ text: codeBlockContent.join('\n'), font: 'Courier New', size: 20 })],
                        spacing: { before: 200, after: 200 },
                    })
                );
                codeBlockContent = [];
                inCodeBlock = false;
            } else {
                // Start code block
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockContent.push(line);
            continue;
        }

        // Handle headings
        if (line.startsWith('# ')) {
            children.push(
                new Paragraph({
                    text: line.substring(2),
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 400, after: 200 },
                })
            );
        } else if (line.startsWith('## ')) {
            children.push(
                new Paragraph({
                    text: line.substring(3),
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 300, after: 150 },
                })
            );
        } else if (line.startsWith('### ')) {
            children.push(
                new Paragraph({
                    text: line.substring(4),
                    heading: HeadingLevel.HEADING_3,
                    spacing: { before: 200, after: 100 },
                })
            );
        }
        // Handle bold text and regular paragraphs
        else if (line.trim().startsWith('**') || line.trim().startsWith('-') || line.trim().startsWith('*')) {
            // Handle list items and bold
            const text = line.replace(/^\*\*(.+?)\*\*:?/, '$1').replace(/^[-*]\s*/, '');
            const isBold = line.includes('**');

            children.push(
                new Paragraph({
                    children: [new TextRun({ text: text, bold: isBold })],
                    spacing: { before: 100, after: 100 },
                    bullet: line.trim().startsWith('-') || (line.trim().startsWith('*') && !line.includes('**')) ? { level: 0 } : undefined,
                })
            );
        }
        // Handle table separator
        else if (line.trim().startsWith('|---')) {
            continue; // Skip table separator lines
        }
        // Handle table rows
        else if (line.trim().startsWith('|')) {
            const cells = line.split('|').filter(cell => cell.trim() !== '');
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }

            const tableCells = cells.map(cell =>
                new TableCell({
                    children: [new Paragraph({ text: cell.trim() })],
                    width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
                })
            );

            tableRows.push(new TableRow({ children: tableCells }));
        }
        // End of table
        else if (inTable && !line.trim().startsWith('|')) {
            children.push(
                new Table({
                    rows: tableRows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                })
            );
            children.push(new Paragraph({ text: '' })); // Add spacing
            inTable = false;
            tableRows = [];

            // Process current line if not empty
            if (line.trim()) {
                children.push(new Paragraph({ text: line }));
            }
        }
        // Regular paragraphs
        else if (line.trim()) {
            children.push(
                new Paragraph({
                    text: line,
                    spacing: { before: 100, after: 100 },
                })
            );
        }
        // Empty lines
        else {
            children.push(new Paragraph({ text: '' }));
        }
    }

    // Handle any remaining table
    if (inTable && tableRows.length > 0) {
        children.push(
            new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
            })
        );
    }

    return new Document({
        sections: [{
            properties: {},
            children: children,
        }],
    });
}

// Convert and save
console.log('Converting database_schema.md to Word document...');
const doc = convertMarkdownToDocx(mdContent);

Packer.toBuffer(doc).then(buffer => {
    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ Successfully created: ${outputPath}`);
}).catch(err => {
    console.error('Error creating Word document:', err);
    process.exit(1);
});
