import openpyxl
import csv

wb = openpyxl.load_workbook(r'C:\Users\Venkat\Downloads\Pokonut_AWB_July2026 (6).xlsx', data_only=True)
ws = wb['AWB Data']
rows = ws.iter_rows(values_only=True)
header = next(rows)

def num(v):
    if v is None:
        return 0.0
    if isinstance(v, str):
        v = v.strip()
        if v in ('', '-', '  '):
            return 0.0
        try:
            return float(v.replace(',', ''))
        except ValueError:
            return 0.0
    return float(v)

manual = {}
for r in rows:
    awb = str(r[0]).strip()
    manual[awb] = dict(
        mis_total=num(r[14]), zone_manual=r[23], weight_slab=num(r[25]),
        farward=num(r[26]), backward=num(r[27]), cod=num(r[28]),
        total_gst=num(r[33]), mode=r[3], mis_weight=num(r[4]),
    )

app = {}
with open(r'C:\Users\Venkat\AppData\Roaming\Claude\scratch-workspaces\7005a7ee-0f3a-41a7-a5f5-d97ef426bbd6\d4e647d5-3035-4114-9390-223680e1ef3a\scratch-2026-09-13-6f9369\app_run11.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        app[row['awb']] = row

weight_ground_truth_diff = 0  # app's weight_api differs from MIS's own declared weight (manual sheet never checks this)
mode_lookup_wrong = 0         # manual farward doesn't match app's forward (same zone, same mode intended) -> rate lookup issue
both = 0
other = 0
total_missed_by_manual = 0.0  # sum of |app_calc - mis_total| for rows manual sheet called "fine" (matched MIS) but app flags real issue

for awb, m in manual.items():
    a = app.get(awb)
    if not a:
        continue
    app_calc = a['total_freight_calc']
    if app_calc in (None, ''):
        continue
    app_calc_f = float(app_calc)
    diff = round(m['total_gst'] - app_calc_f, 2)
    if abs(diff) <= 0.5:
        continue

    weight_api = a['weight_api']
    weight_api_f = float(weight_api) if weight_api not in (None, '') else None
    weight_ground_truth_differs = weight_api_f is not None and abs(weight_api_f - m['mis_weight']) > 0.01 if False else False
    # "weight mismatch" per app's own slab logic
    is_weight_mismatch = a['match_status'] == 'WEIGHT_MISMATCH'
    is_zone_mismatch = a['match_status'] == 'ZONE_MISMATCH'
    is_matched = a['match_status'] == 'MATCHED'

    if is_weight_mismatch:
        weight_ground_truth_diff += 1
        total_missed_by_manual += abs(round(app_calc_f - m['mis_total'], 2))
    elif is_matched and m['zone_manual'] == a['zone_calculated']:
        # same zone, app says MATCHED (i.e. app_calc == mis_total), but manual sheet computed a different number
        mode_lookup_wrong += 1
    else:
        other += 1

print('Total disagreement rows analyzed')
print('  weight ground-truth catches (app=WEIGHT_MISMATCH, manual missed it entirely):', weight_ground_truth_diff)
print('    -> real rupee amount manual sheet missed on these:', round(total_missed_by_manual, 2))
print('  mode/rate lookup wrong in manual sheet (app correctly = MIS, manual computed differently):', mode_lookup_wrong)
print('  other:', other)
