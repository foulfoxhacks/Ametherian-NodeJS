def lum(hex):
    c=[int(hex[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def ratio(a,b):
    l1,l2=sorted([lum(a),lum(b)],reverse=True)
    return (l1+0.05)/(l2+0.05)
for a,b in [('#8B53FE','#FFFFFF'),('#8B53FE','#0B0812'),('#6D3BE0','#FFFFFF'),('#A78BFA','#0B0812'),('#5B2BBF','#FFFFFF'),('#C4B5FD','#0B0812'),('#5FA04E','#0B0812'),('#5FA04E','#FFFFFF')]:
    print(a,b,round(ratio(a,b),2))
