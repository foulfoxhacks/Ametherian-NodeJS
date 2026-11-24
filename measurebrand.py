from PIL import Image
import numpy as np
im=Image.open(r'E:\Codebase\Ametherian (2).png').convert('L')
a=np.array(im)
print('size', im.size)
mask=a<200
rows=mask.sum(axis=1)
# print contiguous row bands with any ink
bands=[]; start=None
for y,v in enumerate(rows):
    if v>2 and start is None: start=y
    elif v<=2 and start is not None: bands.append((start,y-1,int(rows[start:y].max()))); start=None
if start is not None: bands.append((start,len(rows)-1,int(rows[start:].max())))
print('row bands', bands)
for y0,y1,_ in bands:
    cols=mask[y0:y1+1].sum(axis=0)
    xs=np.where(cols>0)[0]
    print('band',y0,y1,'x',xs.min(),xs.max())
