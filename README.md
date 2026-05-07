# VoxPDF — Lector de PDF con Voz

Aplicacion web para escuchar documentos PDF en voz alta con seguimiento visual palabra por palabra (estilo karaoke), navegacion por paginas, buscador interno y soporte de tema oscuro y claro. No requiere servidor ni instalacion — funciona directo en el navegador.

si desean probarlo sin hacer nada pueden hacerlo mediante este link:https://lectoravoz1.pages.dev

---

## Demo

Abre `index.html` en cualquier navegador moderno y carga un PDF para comenzar.

---

## Caracteristicas

- **Lectura en voz alta**: convierte el texto de cada pagina PDF a audio usando ResponsiveVoice y Web Speech API.
- **Seguimiento visual karaoke**: resalta cada palabra en tiempo real mientras se lee.
- **Navegacion por paginas**: avanza, retrocede o salta directamente a cualquier pagina.
- **Buscador interno**: encuentra en que paginas aparece una palabra o frase.
- **Control de reproduccion**: pausa (conserva el avance), stop y reanudacion.
- **Velocidad y tono ajustables**: controles deslizantes para personalizar la lectura.
- **Seleccion de voz**: muestra las voces en espanol disponibles en el dispositivo.
- **Zoom**: acercar y alejar el visor del PDF.
- **Tema oscuro / claro**: guardado automaticamente en el navegador.
- **Responsivo**: interfaz adaptada para escritorio y movil.

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| HTML / CSS / JavaScript | Desarrollo completo sin frameworks |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Renderizado del PDF en canvas |
| [ResponsiveVoice](https://responsivevoice.org/) | Motor de texto a voz principal |
| Web Speech API | Motor de voz alternativo del navegador |
| localStorage | Guardado de preferencias del usuario |

---

## Estructura del Proyecto

```
voxpdf/
└── index.html    # Aplicacion completa en un solo archivo
```

---

## Uso

1. Abre `index.html` en tu navegador.
2. Haz clic en **Abrir PDF** o usa el boton **Cargar ejemplo**.
3. Navega a la pagina deseada con los controles de pagina.
4. Pulsa **Leer pagina actual** para iniciar la lectura.
5. Usa **Pausa** para conservar el avance y **Stop** para reiniciar.
6. Activa el **Seguimiento visual** para ver el resaltado karaoke.

---

## Seguimiento Karaoke

Al leer una pagina, se muestra un panel inferior con el texto completo. Cada palabra se resalta en verde conforme avanza la lectura. El seguimiento puede activarse o desactivarse desde la barra de herramientas o el panel lateral.

---

## Preferencias guardadas

La aplicacion recuerda automaticamente en el navegador:

- Tema (oscuro o claro)
- Velocidad y tono de voz
- Voz seleccionada
- Estado del seguimiento visual

---

## Compatibilidad

Funciona en navegadores modernos con soporte de Web Speech API o conexion a ResponsiveVoice. Recomendado: Brave,Chrome, Edge o Firefox en su version mas reciente.

---
