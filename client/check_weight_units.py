import openpyxl
from collections import Counter

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

small_weight_wrong_slab = []
weight_value_dist = Counter()

for row in ws.iter_rows(min_row=2, values_only=True):
    awb = row[0]
    weight_manual = num(row[24])
    weight_slab = num(row[25])
    if weight_manual is None:
        continue
    # bucket the raw manual weight value to see the distribution (grams vs kg mixing)
    if weight_manual <= 20:
        weight_value_dist['<=20 (looks like already-kg)'] += 1
    else:
        weight_value_dist['>20 (looks like grams)'] += 1

    # If weight_manual looks like it's already in kg (small number, e.g. 1,2,3) but
    # weight_slab is still 0.5, that's the bug: formula always divides by 1000.
    if weight_manual is not None and weight_manual <= 20 and weight_manual > 0.5 and weight_slab == 0.5:
        small_weight_wrong_slab.append((awb, weight_manual, weight_slab))

print('Weight value distribution (manual WEIGHT column):', dict(weight_value_dist))
print()
print('Rows where WEIGHT looks like already-kg (>0.5) but WEIGHT_SLAB stuck at 0.5:', len(small_weight_wrong_slab))
for awb, w, s in small_weight_wrong_slab[:15]:
    print(' ', awb, 'WEIGHT=', w, 'WEIGHT_SLAB=', s, '(should be', (2 if w<=1 else (3 if w<=1.5 else 4)), '* 0.5 =', (1.0 if w<=1 else (1.5 if w<=1.5 else 2.0)), ')')
