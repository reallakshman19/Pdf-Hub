import pathlib,sys,hashlib,json
wp,root=sys.argv[1:]; root=pathlib.Path(root)
def patch(name,old,new):
    p=root/name; raw=p.read_text(); assert raw.count(old)==1,(name,old,raw.count(old))
    replaced=raw.replace(old,new); p.write_text(replaced)
    print(json.dumps({"file":name,"before_sha256":hashlib.sha256(raw.encode()).hexdigest(),"after_sha256":hashlib.sha256(replaced.encode()).hexdigest(),"purpose":"harness compatibility only"}))
if wp=="01":
    patch("tests/helpers.ts", """const input=page.locator('input[type="number"][min="1"]').first();""", """const input=page.locator('[data-testid="status-bar"] input[aria-label^="Page "]');""")
    patch("tests/helpers.ts", "await input.fill(String(no));", "await input.fill(String(no));await input.press('Enter');")
    p=root/"benchmarks/benchmarks.spec.ts"
    raw=p.read_text(); old="await mkdir('benchmarks');await fs.writeFile(path.join(EVIDENCE,'benchmarks','raw.csv'),out);"
    new="await mkdir('benchmarks');const dest=path.join(EVIDENCE,'benchmarks','raw.csv'); try { await fs.access(dest); } catch { await fs.writeFile(dest,columns.join(',')+'\\n'); } await fs.appendFile(dest,columns.map(k=>esc(row[k])).join(',')+'\\n');"
    patch("benchmarks/benchmarks.spec.ts",old,new)
elif wp=="02":
    patch("tests/support.ts", "resolve(dirname(fileURLToPath(import.meta.url)), '..')", "resolve(__dirname, '..')")
elif wp=="03":
    patch("tests/helpers.cjs", "test.beforeEach(async({page},testInfo)=>{", "test.beforeEach(async({page},testInfo)=>{\n  await page.addInitScript(()=>{delete window.showOpenFilePicker;delete window.showSaveFilePicker;});")
else: raise ValueError(wp)
