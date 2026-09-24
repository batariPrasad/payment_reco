import openpyxl
import csv

wb = openpyxl.load_workbook(r'C:\Users\Venkat\Downloads\Pokonut_AWB_July2026 (6).xlsx', data_only=True)
ws = wb['AWB Data']
rows = ws.iter_rows(values_only=True)
header = next(rows)

def num(v):
    if v is None: return 0.0
    if isinstance(v, str):
        v = v.strip()
        if v in ('', '-', '  '): return 0.0
        try: return float(v.replace(',', ''))
        except ValueError: return 0.0
    return float(v)

manual = {}
for r in rows:
    awb = str(r[0]).strip()
    manual[awb] = dict(
        mis_total=num(r[14]), zone_manual=r[23], weight_slab=num(r[25]),
        farward=num(r[26]), backward=num(r[27]), cod=num(r[28]),
        total_gst=num(r[33]), mode=r[3], mis_weight=num(r[4]), mis_zone=r[5],
        status=r[6], payment=r[7],
    )

print('Manual file rows loaded:', len(manual))

manual_abs_sum = sum(abs(m['total_gst'] - m['mis_total']) for m in manual.values())
manual_signed_sum = sum(m['total_gst'] - m['mis_total'] for m in manual.values())
print('Manual (vs MIS) ABS sum:', round(manual_abs_sum, 2))
print('Manual (vs MIS) SIGNED sum:', round(manual_signed_sum, 2))

app = {}
with open(r'C:\Users\Venkat\AppData\Roaming\Claude\scratch-workspaces\7005a7ee-0f3a-41a7-a5f5-d97ef426bbd6\d4e647d5-3035-4114-9390-223680e1ef3a\scratch-2026-09-13-6f9369\app_run12.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        app[row['awb']] = row

print('App run12 rows loaded:', len(app))

app_abs_sum = 0.0
app_signed_sum = 0.0
for awb, a in app.items():
    fd = a.get('freight_delta')
    if fd not in (None, ''):
        app_abs_sum += abs(float(fd))
        app_signed_sum += float(fd)
print('App (calc vs MIS) ABS sum (=total_discrepancy):', round(app_abs_sum, 2))
print('App (calc vs MIS) SIGNED sum:', round(app_signed_sum, 2))

# Direct manual-vs-app comparison
disagree = []
for awb, m in manual.items():
    a = app.get(awb)
    if not a:
        continue
    app_calc = a.get('total_freight_calc')
    if app_calc in (None, ''):
        continue
    app_calc_f = float(app_calc)
    diff = round(m['total_gst'] - app_calc_f, 2)
    if abs(diff) > 0.5:
        disagree.append((awb, m, a, diff))

print()
print('Rows where manual total+gst != app total_freight_calc (diff > 0.5):', len(disagree))
disagree.sort(key=lambda x: -abs(x[3]))
print()
print('TOP 20 disagreements by absolute size (AWB / tracking ID list):')
for awb, m, a, diff in disagree[:20]:
    print(f'--- AWB {awb}  diff={diff}')
    print(f'    MIS total={m["mis_total"]}  manual_total_gst={m["total_gst"]}  app_calc={a["total_freight_calc"]}  app_status={a["match_status"]}')
    print(f'    manual: zone={m["zone_manual"]} weight_slab={m["weight_slab"]} farward={m["farward"]} backward={m["backward"]} cod={m["cod"]}')
    print(f'    app:    zone_calc={a["zone_calculated"]} weight_api={a["weight_api"]} fwd={a["forward_freight_calc"]} rto={a["rto_freight_calc"]} cod={a["cod_charge_calc"]}')
    print(f'    mode={m["mode"]}  mis_status={m["status"]}  app_status_api={a["status_api"]}  payment={m["payment"]}/{a["payment_api"]}')
