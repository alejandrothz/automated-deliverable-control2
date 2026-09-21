# =====================================================================
# test_main.py — Pruebas unitarias de la Cloud Function
# Se ejecutan con: pytest -v
# No tocan la nube: llaman a las funciones de main.py con datos inventados.
# =====================================================================

import json
from main import validar, procesar #traemos las dos funciones a probar

# ---------------------------------------------------------------------
# PARTE 1: pruebas de validar()
# Cada funcion que empieza con test_ es una prueba independiente.
# assert = "esto DEBE ser verdad". Si no lo es, la prueba falla.
# ---------------------------------------------------------------------

def test_archivo_valido():
    # Caso correcto: nombre con guion, PDF, 400 KB
    assert validar("informe-01.pdf", "application/pdf", 400) == ("PENDIENTE_REVISION", "")

def test_nombre_sin_guion():
    estado, motivo = validar("archivo.pdf", "application/pdf", 400)
    assert estado == "ERROR"
    assert "el nombre no sigue las reglas: nombre-#" in motivo

def test_tipo_no_permitido():
    estado, motivo = validar("notas-01.txt", "text/plain", 1)
    assert estado == "ERROR"
    assert "tipo" in motivo

def test_archivo_muy_grande():
    estado, motivo = validar("informe-01.pdf", "application/pdf", 99999)
    assert estado == "ERROR"
    assert "mayor a 10" in motivo

def test_limite_exacto_se_acepta():
    # Caso borde: exactamente 10 MB (10240 KB) SI se acepta,
    # porque la regla es "mayor a", no "mayor o igual".
    assert validar("informe-01.pdf", "application/pdf", 10240)[0] == "PENDIENTE_REVISION"


# ---------------------------------------------------------------------
# PARTE 2: pruebas de procesar()
# procesar() espera un evento de la nube. En lugar de uno real,
# le damos un objeto falso que solo tiene lo que usa: .data
# ---------------------------------------------------------------------

class EventoFalso:
    """Imita un evento de Cloud Storage con los datos que le pasemos."""
    def __init__(self, data):
        self.data = data

def test_procesar_flujo_exitoso(capsys):
    # capsys es una herramienta de pytest que "atrapa" lo que se imprime.
    # Como procesar() escribe su resultado con print(), asi lo leemos.
    procesar(EventoFalso({
        "name": "informe-01.pdf",
        "contentType": "application/pdf",
        "size": "2048",            # llega como texto y en bytes, igual que en la nube
        "generation": "123",
    }))
    log = json.loads(capsys.readouterr().out)   # si no fuera JSON valido, esto truena
    assert log["severity"] == "INFO"
    assert log["estado"] == "PENDIENTE_REVISION"
    assert log["kb"] == 2                        # 2048 bytes = 2 KB

def test_procesar_evento_sin_nombre(capsys):
    # Manejo de errores: falta "name". La funcion NO debe tronar,
    # debe registrar un log de ERROR y terminar.
    procesar(EventoFalso({"contentType": "application/pdf", "size": "10", "generation": "1"}))
    log = json.loads(capsys.readouterr().out)
    assert log["severity"] == "ERROR"
    assert log["message"] == "evento con datos incompletos"


def test_procesar_tamano_invalido(capsys):
    # Manejo de errores: size no es numero -> ValueError atrapado
    procesar(EventoFalso({"name": "informe-01.pdf", "size": "abc", "generation": "1"}))
    log = json.loads(capsys.readouterr().out)
    assert log["severity"] == "ERROR"