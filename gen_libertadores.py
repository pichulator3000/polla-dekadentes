"""Genera Excel de partidos Copa Libertadores 2026 para importar en la Polla."""
import openpyxl

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Partidos"

# Mismo formato que mundial_2026.xlsx
headers = ["local", "visita", "torneo", "fase", "sede", "fecha_hora_chile", "fecha_hora_utc"]
ws.append(headers)

TORNEO = "Copa Libertadores 2026"

# Hora Argentina - 1 = hora Chile
# UTC = hora Chile + 4
partidos = [
    # Martes 14 de abril 2026
    # 19 ARG = 18 Chile = 22 UTC
    ("Cerro Porteño", "Junior", "", "", "2026-04-14T18:00", "2026-04-14T22:00"),
    ("Estudiantes", "Cusco", "", "", "2026-04-14T18:00", "2026-04-14T22:00"),
    ("Nacional", "D. Tolima", "", "", "2026-04-14T18:00", "2026-04-14T22:00"),
    # 21 ARG = 20 Chile = 00 UTC (+1 day)
    ("Boca", "Barcelona", "", "", "2026-04-14T20:00", "2026-04-15T00:00"),
    ("Bolívar", "D. La Guaira", "", "", "2026-04-14T20:00", "2026-04-15T00:00"),
    # 23 ARG = 22 Chile = 02 UTC (+1 day)
    ("Liga de Quito", "Mirassol", "", "", "2026-04-14T22:00", "2026-04-15T02:00"),
    ("Universitario", "Coquimbo", "", "", "2026-04-14T22:00", "2026-04-15T02:00"),

    # Miércoles 15 de abril 2026
    # 19 ARG = 18 Chile = 22 UTC
    ("Cruzeiro", "U. Católica", "", "", "2026-04-15T18:00", "2026-04-15T22:00"),
    ("Libertad", "Rosario Central", "", "", "2026-04-15T18:00", "2026-04-15T22:00"),
    # 21.30 ARG = 20.30 Chile = 00:30 UTC (+1 day)
    ("Corinthians", "Independiente Santa Fe", "", "", "2026-04-15T20:30", "2026-04-16T00:30"),
    ("Fluminense", "Independiente Rivadavia", "", "", "2026-04-15T20:30", "2026-04-16T00:30"),
    # 23 ARG = 22 Chile = 02 UTC (+1 day)
    ("Independiente del Valle", "Universidad Central", "", "", "2026-04-15T22:00", "2026-04-16T02:00"),

    # Jueves 16 de abril 2026
    # 19 ARG = 18 Chile = 22 UTC
    ("Lanús", "Always Ready", "", "", "2026-04-16T18:00", "2026-04-16T22:00"),
    ("Palmeiras", "Sporting Cristal", "", "", "2026-04-16T18:00", "2026-04-16T22:00"),
    # 21.30 ARG = 20.30 Chile = 00:30 UTC (+1 day)
    ("Flamengo", "Independiente Medellín", "", "", "2026-04-16T20:30", "2026-04-17T00:30"),
    ("Peñarol", "Platense", "", "", "2026-04-16T20:30", "2026-04-17T00:30"),
]

for local, visita, fase, sede, chile, utc in partidos:
    ws.append([local, visita, TORNEO, fase, sede, chile, utc])

out = "libertadores_2026.xlsx"
wb.save(out)
print(f"OK - {out} creado con {len(partidos)} partidos")
