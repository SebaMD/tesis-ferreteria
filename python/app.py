from fastapi import FastAPI

app = FastAPI(title="Servicio Python")


@app.get("/")
def root():
    return {"message": "Servicio Python activo"}


@app.get("/health")
def health():
    return {"status": "ok"}
