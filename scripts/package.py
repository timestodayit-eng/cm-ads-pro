from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
output=root/'release'/'coastal-ads-command-center-built.zip'
output.parent.mkdir(exist_ok=True)
allowed_dirs={'client','server','shared','sql','scripts','tests','docs','tools','.github','dist'}
allowed_files={'server.js','index.html','vite.config.js','package.json','package-lock.json','.gitignore','.env.example','README.md','START-HERE.md','SECURITY.md','FRESH-INSTALL.md','UPGRADE.md','INSTALL-v0.7.md'}
with ZipFile(output,'w',ZIP_DEFLATED) as z:
    for p in sorted(root.rglob('*')):
        if not p.is_file():continue
        rel=p.relative_to(root)
        if rel.parts[0] not in allowed_dirs and str(rel) not in allowed_files:continue
        if p.name=='.env' or (p.name.startswith('.env.') and p.name!='.env.example'):continue
        if '__pycache__' in rel.parts or 'node_modules' in rel.parts:continue
        z.write(p,rel.as_posix())
print(output)
