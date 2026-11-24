import sys, inspect
sys.path.insert(0,'_pylibs')
import potrace
for c in ['Bitmap','Curve','BezierSegment','CornerSegment']:
    cls=getattr(potrace,c)
    print('---',c)
    print(inspect.getsource(cls)[:3000])
