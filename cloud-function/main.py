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

# definios las reglas y los tipos permitidos
TIPOS_PERMITIDOS = ["application/pdf", "image/jpeg", "image/png"]
LIMITE_KB = 10240 # maximo 10 MB

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