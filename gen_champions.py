"""Genera Excel de partidos Champions League 2025-26 para importar en la Polla."""
import openpyxl

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Partidos"

# Mismo formato que mundial_2026.xlsx
headers = ["local", "visita", "torneo", "fase", "sede", "fecha_hora_chile", "fecha_hora_utc"]
ws.append(headers)

TORNEO = "Champions League"

# Hora dada en hora Chile directamente
# UTC = hora Chile + 4
partidos = [
    # Martes 14 de abril 2026 - 15:00 Chile = 19:00 UTC
    ("Liverpool", "Paris Saint-Germain", "Cuartos de final", "", "2026-04-14T15:00", "2026-04-14T19:00"),
    ("Atlético", "Barcelona", "Cuartos de final", "", "2026-04-14T15:00", "2026-04-14T19:00"),
    # Miércoles 15 de abril 2026 - 15:00 Chile = 19:00 UTC
    ("Arsenal", "Sp. Portugal", "Cuartos de final", "", "2026-04-15T15:00", "2026-04-15T19:00"),
    ("Bayern Múnich", "R. Madrid", "Cuartos de final", "", "2026-04-15T15:00", "2026-04-15T19:00"),
]

for local, visita, fase, sede, chile, utc in partidos:
    ws.append([local, visita, TORNEO, fase, sede, chile, utc])

out = "champions_2026.xlsx"
wb.save(out)
print(f"OK - {out} creado con {len(partidos)} partidos")
