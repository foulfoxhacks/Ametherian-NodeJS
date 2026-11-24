from PIL import Image
import numpy as np
im=Image.open(r'E:\Codebase\Ametherian.png').convert('RGB')
a=np.array(im)
# sample most common non-white colors
pix=a.reshape(-1,3)
mask=(pix.min(axis=1)<240)
from collections import Counter
c=Counter(map(tuple,pix[mask]))
for col,n in c.most_common(8): print(col,n)
