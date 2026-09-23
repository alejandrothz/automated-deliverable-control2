# ==================================================
# main.py - Cloud Function del dia 1
# Se despierta sola cuando llegaun archivo al bucket, lee sus datos,
# los valida y deja el resultado registrado en cloud logging.
# ===================================================

# librerias utilizadas
# convertimos los datos de python a texto json par los logs
import json

# function framework: la libreria de google que conecta este archivo
# con la nube. recibe el evento y llama a la funcion
import functions_framework

# Nuevos import dia 3
import os           # lee variables de entorno
import time         # para la hora actual (el ts)
import hmac         # para calcular el sello
import hashlib      # el algoritmo del sello (sha256)
import base64       # para pasar el sello a texto
import requests     # para enviar la peticion por internet

# definios las reglas y los tipos permitidos
TIPOS_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"]
LIMITE_KB = 10240 # maximo 10 MB

## constantes agregadas
# se leen al arrancar, del entorno de la funcion
# No se escriben en codigo

# os.environ.get lee una variable de entorno. El segundo valor es el respaldo si no existe
# evita que la funcio no funcione al arrancar

SECRET = os.environ.get("SECRET", "")
URL_SCRIPT = os.environ.get("SCRIPT_URL", "")

# funcion escribir logs
def log(severidad, mensaje, **datos):
    # imprime una linea en formato JSON.
    # severity: se reconoce como nivel del log (info, warning, error)
    # message: texto principal
    # datos: acepta cualquier cantidad de parametros con nombre

    print(json.dumps({"severity": severidad, "message": mensaje, **datos}))

# funcion para validar el archivo

def validar(nombre, tipo, kb):
    # verifica que el archivo tenga formatos validos y debuelve
    # el estado y el motivo

    # regla para los nombres, tiene que tener el tipo:
    # "informe-01.pdf" si no tiene guion se considera mal nombrado
    if "-" not in nombre:
        return "ERROR", "el nombre no sigue las reglas: nombre-#"
    
    # regla 2: solo pdf, jpg o png
    if tipo not in TIPOS_PERMITIDOS:
        return "ERROR", "el tipo del archivo no esta permitido, pdf, jpg, jpeg"
        
    # regla 3: nada mayor a 10MB
    if kb > LIMITE_KB:
        return "ERROR", "el archivo es mayor a 10MB"
    
    return "PENDIENTE_REVISION", ""

# funcion para usar eventarc
# functions_framework.cloud_event es la funcion que se llama cuando
# llega un evento

## funciones nuevas
def firmar(ts, generation, archivo):
    """
    calcula el sello de la peticion al igual que en apps script, se firma una cadena armada
    con puntos.
    python y javascript escriben el json con pequeñas diferencias y bastaria una para 
    que no funcione, por eso es mejor generarlo nosotros
    """
    cadena = ts + "." + generation + "." + archivo

    # hmac.new mezcla el secreto con la cadena y devuelve bytes;\
    #b64encode los pasa a texto para poder enviarlos
    sello = hmac.new(SECRET.encode(), cadena.encode(), hashlib.sha256).digest()
    return base64.b64encode(sello).decode()

def enviar_a_sheet(datos):
    """
    Envia los datos al apps script y registra el resultado

    va en su propia funcion y con su propio try/except
    si el envio falla el archivo ya quedo registrado en los logs de gcp
    """
    try:
        #timeout: si el script no responde en 30 seg se corta
        # asi no se queda esperando indefinidamente
        respuesta = requests.post(URL_SCRIPT, json = datos, timeout=30)
        log("INFO", "enviado a sheet", archivo = datos ["archivo"], respuesta = respuesta.text)
    except Exception as e:
        log("ERROR", "fallo el envio a sheet", archivo=datos["archivo"], detalle=str(e))


@functions_framework.cloud_event
def procesar(evento):

    # extraemos los metadatos del archivo
    try:
        d = evento.data #informacion del achivo
        archivo = d["name"]                         #nombre del archivo
        tipo = d.get("contentType", "desconocido")  #.get: si no viene, usa desconocido
        kb = round(int(d["size"]) / 1024)           #size llega como texto y en bytes
        generation = str(d["generation"])           # duplicados

    # si falta algun campo es keyError, 
    # el dato no es el tipo esperado es TypeError
    # o el tamaño no es un numero ValueError
    # deja evidencia en el log y termina.
    except(KeyError, TypeError, ValueError) as e:
        log ("ERROR", "evento con datos incompletos", detalle=str(e))
        #regresa sin lanzar error: reintentar no arreglaria un evento
        return
    
    # validar
    # se pueden guardar los dos valres en dos variables
    estado, motivo = validar (archivo, tipo, kb)

    # registrar
    # WARNING: se usara si el archivo fallo en la validacion
    # INFO: para distinguirlo a simple vista como aviso

    log("WARNING" if estado == "ERROR" else "INFO", "archivo procesado", 
    archivo=archivo, tipo=tipo, kb=kb, generation=generation, 
    estado=estado, motivo=motivo)

    #enviar los datos al apps scritp, firmados
    ts = str(int(time.time())) # hora actual en segundos, como texto

    enviar_a_sheet({
        "ts": ts,
        "generation": generation,
        "archivo": archivo,
        "sig": firmar(ts,generation, archivo),
        "tipo": tipo,
        "kb": kb,
        "estado": estado,
        "motivo": motivo,
    })