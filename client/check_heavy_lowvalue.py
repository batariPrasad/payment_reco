import openpyxl

wb = openpyxl.load_workbook(r'C:\Users\Venkat\Downloads\Pokonut_AWB_July2026 (6).xlsx', data_only=True)
ws = wb['AWB Data']

def num(v):
    if v is None: return None
    if isinstance(v, str):
        v = v.strip()
        if v in ('', '-'): return None
        try: return float(v)
        except: return None
    return float(v)

# Look at every row with raw shipment-report WEIGHT <= 20 (the ambiguous bucket),
# and check product/order-value/sku_count to see if any look like genuinely heavy items.
suspects = []
for row in ws.iter_rows(min_row=2, values_only=True):
    w = num(row[24])
    if w is not None and 0.5 < w <= 20:
        suspects.append((row[0], w, row[17], row[19], row[20]))

print('Total rows with raw shipment-report weight in (0.5, 20]:', len(suspects))
# Sort by order value descending to find the "heaviest looking" (most expensive / multi-item) orders
suspects.sort(key=lambda x: -(x[2] or 0))
print('Top 15 by order value (most likely to be genuinely heavy combo/multi-item):')
for awb, w, ov, skucount, prod in suspects[:15]:
    print(f'  {awb}  raw_weight={w}  order_value={ov}  sku_count={skucount}  product={prod}')

print()
print('Distinct raw weight values in this bucket and counts:')
from collections import Counter
c = Counter(s[1] for s in suspects)
for val, cnt in sorted(c.items()):
    print(f'  weight={val}: {cnt} rows')
