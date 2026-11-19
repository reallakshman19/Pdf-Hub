from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont
import hashlib, json, csv, io
ROOT=Path(__file__).resolve().parent

def pdf(path, n):
    c=canvas.Canvas(str(path), pagesize=(612,792), invariant=1, pageCompression=1)
    for i in range(1,n+1):
        c.setPageSize((612,792) if i%3!=0 else (792,612))
        c.setFont('Helvetica',14); c.drawString(72,520 if i%3==0 else 700,f'PDFHUB FIXTURE PAGE {i:04d}')
        y=480 if i%3==0 else 650
        c.setFont('Helvetica',12); c.drawString(72,y,'ALPHA VALVE 10 BAR'); c.drawString(72,y-24,'BETA PUMP 25 L/MIN'); c.drawString(72,y-48,'PUBLIC SYNTHETIC DATA ONLY')
        c.rect(72,120,180,72); c.line(72,156,252,156); c.line(162,120,162,192)
        for x,z,t in [(82,168,'A1'),(172,168,'B1'),(82,132,'A2'),(172,132,'B2')]: c.drawString(x,z,t)
        c.showPage()
    c.save()

pdf(ROOT/'F01-text-mixed-3p.pdf',3)
pdf(ROOT/'F05-benchmark-100p.pdf',100)
pdf(ROOT/'F06-benchmark-500p.pdf',500)
# Actual native rotation with no visual reflow of source coordinates.
c=canvas.Canvas(str(ROOT/'F02-rotated-2p.pdf'),pagesize=(612,792),invariant=1)
for i,angle in [(1,0),(2,90)]:
    c.setPageRotation(angle); c.setFont('Helvetica',14); c.drawString(72,500,f'ROTATION PAGE {i}'); c.rect(72,360,144,60); c.drawString(82,380,'ANCHOR'); c.showPage()
c.save()
# Raster-only PDF, independently readable image.
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',46)
im=Image.new('RGB',(1224,1584),'white'); d=ImageDraw.Draw(im)
for i,t in enumerate(['SCAN FIXTURE 001','ALPHA VALVE 10 BAR','BETA PUMP 25 L/MIN','TAG P-101']): d.text((140,150+i*100),t,font=font,fill='black')
im.save(ROOT/'F03-scan.png')
c=canvas.Canvas(str(ROOT/'F03-scan-only.pdf'),pagesize=(612,792),invariant=1); c.drawImage(ImageReader(im),0,0,width=612,height=792); c.showPage(); c.save()
im=Image.new('RGBA',(240,100),(0,0,0,0)); d=ImageDraw.Draw(im);d.rectangle((10,10,230,90),fill=(0,80,160,255));d.rectangle((30,30,210,70),fill=(255,255,255,255));im.save(ROOT/'F04-logo-transparent.png')
(ROOT/'F07-records.csv').write_text('id,title,tag,pressure\nR001,Alpha Valve,P-101,10\nR002,Beta Pump,P-102,25\n',encoding='utf-8')
(ROOT/'F08-invalid.pdf').write_bytes(b'%PDF-1.7\ntruncated synthetic negative input\n')
files={p.name:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted(ROOT.iterdir()) if p.is_file() and p.name not in ('manifest.json','generate.py','verify_fixtures.py')}
(ROOT/'manifest.json').write_text(json.dumps({'version':'PDFHUB-SYNTH-1','classification':'public synthetic input only, no expected output golden','files':files},indent=2)+'\n')
