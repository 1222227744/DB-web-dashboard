from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
LATEX = DOCS / "latex"
WORK = LATEX / "work"
SRC = LATEX / "src"
PDF = LATEX / "pdf"

for path in (WORK, SRC, PDF):
    path.mkdir(parents=True, exist_ok=True)

SOURCE_MAP = {
    "需求文档": (DOCS / "需求文档.md").read_text(encoding="utf-8"),
    "需求规格说明书": (DOCS / "需求规格说明书.md").read_text(encoding="utf-8"),
    "概要设计说明书": (DOCS / "概要设计.md").read_text(encoding="utf-8"),
    "详细设计说明书": "\n\n".join([
        (DOCS / "详细设计.md").read_text(encoding="utf-8"),
        "# 数据库设计附录\n\n" + (DOCS / "数据库设计.md").read_text(encoding="utf-8"),
        "# 安全设计附录\n\n" + (DOCS / "安全设计.md").read_text(encoding="utf-8"),
    ]),
    "接口文档": (DOCS / "接口规范.md").read_text(encoding="utf-8"),
}

BOX_DRAWING_TRANSLATION = str.maketrans({
    "┌": "+",
    "┐": "+",
    "└": "+",
    "┘": "+",
    "├": "+",
    "┤": "+",
    "┬": "+",
    "┴": "+",
    "┼": "+",
    "─": "-",
    "│": "|",
})


def sanitize_for_latex_markdown(content: str) -> str:
    """Normalize characters that commonly miss in monospaced PDF fonts."""
    return content.translate(BOX_DRAWING_TRANSLATION)


def cleanup_intermediate_files() -> None:
    """Keep generated LaTeX sources and PDFs, remove temporary build files."""
    if WORK.exists():
        shutil.rmtree(WORK)

    for path in SRC.iterdir():
        if path.is_file() and path.suffix.lower() != ".tex":
            path.unlink()

    for path in PDF.iterdir():
        if path.is_file() and path.suffix.lower() != ".pdf":
            path.unlink()


PANDOC = shutil.which("pandoc")
LATEXMK = shutil.which("latexmk")
if not PANDOC:
    raise SystemExit("pandoc not found")
if not LATEXMK:
    raise SystemExit("latexmk not found")

cleanup_intermediate_files()
WORK.mkdir(parents=True, exist_ok=True)

common_args = [
    "--standalone",
    "--toc",
    "--number-sections",
    "--from", "markdown+pipe_tables+fenced_code_blocks+backtick_code_blocks",
    "-V", "documentclass=ctexart",
    "-V", "classoption=UTF8",
    "-V", "papersize=a4",
    "-V", "geometry:margin=2.5cm",
    "-V", "colorlinks=true",
    "-V", "linkcolor=blue",
    "-V", "urlcolor=blue",
    "-V", "toc-title=目录",
]

for title, content in SOURCE_MAP.items():
    md_path = WORK / f"{title}.md"
    tex_path = SRC / f"{title}.tex"
    md_path.write_text(sanitize_for_latex_markdown(content), encoding="utf-8")
    subprocess.run([
        PANDOC,
        str(md_path),
        *common_args,
        "--metadata", f"title={title}",
        "--metadata", "author=DBMS 控制台项目",
        "-o", str(tex_path),
    ], check=True, cwd=ROOT)

for tex_path in sorted(SRC.glob("*.tex")):
    subprocess.run([
        LATEXMK,
        "-xelatex",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-file-line-error",
        f"-output-directory={PDF}",
        str(tex_path),
    ], check=True, cwd=ROOT)

cleanup_intermediate_files()

print("Generated LaTeX sources:")
for path in sorted(SRC.glob("*.tex")):
    print(path.relative_to(ROOT))
print("Generated PDFs:")
for path in sorted(PDF.glob("*.pdf")):
    print(path.relative_to(ROOT))
