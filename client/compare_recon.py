import openpyxl
import csv

# --- Load user's manual file ---
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
    mis_total = num(r[14])
    zone_manual = r[23]
    weight_slab = num(r[25])
    farward = num(r[26])
    backward = num(r[27])
    cod = num(r[28])
    total_frt = num(r[31]) if r[31] is not None else (farward + backward + cod)
    gst = num(r[32]) if r[32] is not None else total_frt * 0.18
    total_gst = num(r[33]) if r[33] is not None else total_frt + gst
    manual[awb] = dict(
        mis_total=mis_total, zone_manual=zone_manual, weight_slab=weight_slab,
        farward=farward, backward=backward, cod=cod,
        total_frt=total_frt, gst=gst, total_gst=total_gst,
        drop_pincode=r[22], status=r[6], payment=r[7], mode=r[3], mis_zone=r[5],
    )

print('Manual file rows loaded:', len(manual))

# --- User's own discrepancy sum ---
manual_abs_sum = 0.0
manual_signed_sum = 0.0
for awb, m in manual.items():
    d = m['total_gst'] - m['mis_total']
    manual_abs_sum += abs(d)
    manual_signed_sum += d
print('Manual ABS discrepancy sum:', round(manual_abs_sum, 2))
print('Manual SIGNED discrepancy sum:', round(manual_signed_sum, 2))

# --- Load app's CSV export ---
app = {}
with open(r'C:\Users\Venkat\AppData\Roaming\Claude\scratch-workspaces\7005a7ee-0f3a-41a7-a5f5-d97ef426bbd6\d4e647d5-3035-4114-9390-223680e1ef3a\scratch-2026-09-13-6f9369\app_run11.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        app[row['awb']] = row

print('App file rows loaded:', len(app))

# --- Cross-reference: find rows where manual and app disagree on total_gst vs total_freight_calc ---
both = 0
disagree = []
missing_in_app = 0
for awb, m in manual.items():
    a = app.get(awb)
    if not a:
        missing_in_app += 1
        continue
    both += 1
    app_calc = a['total_freight_calc']
    app_calc_f = float(app_calc) if app_calc not in (None, '') else None
    if app_calc_f is None:
        continue
    diff = round(m['total_gst'] - app_calc_f, 2)
    if abs(diff) > 0.5:
        disagree.append((awb, m, a, diff))

print('Rows present in both:', both)
print('Missing in app (no shipment data):', missing_in_app)
print('Rows where manual total != app calculated total (diff > 0.5):', len(disagree))

# Print first 15 disagreements with full detail
for awb, m, a, diff in disagree[:15]:
    print('---', awb, 'diff=', diff)
    print('  MIS total:', m['mis_total'], '| manual total+gst:', m['total_gst'], '| app calc total:', a['total_freight_calc'], '| app match_status:', a['match_status'])
    print('  manual zone:', m['zone_manual'], '| app zone_calculated:', a['zone_calculated'], '| mis zone:', m['mis_zone'])
    print('  manual weight_slab:', m['weight_slab'], '| app weight_api:', a['weight_api'])
    print('  manual farward/backward/cod:', m['farward'], m['backward'], m['cod'], '| app forward/rto/cod:', a['forward_freight_calc'], a['rto_freight_calc'], a['cod_charge_calc'])
    print('  status:', m['status'], '| app status_api:', a['status_api'], '| payment:', m['payment'], '| app payment_api:', a['payment_api'])
