import sys, inspect
sys.path.insert(0,'_pylibs')
import potrace
print(potrace.__doc__)
print([n for n in dir(potrace) if not n.startswith('_')])
print(inspect.getsource(potrace.Path))
