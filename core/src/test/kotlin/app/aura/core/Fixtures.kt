package app.aura.core

object Fixtures {
    fun read(name: String): String =
        requireNotNull(javaClass.classLoader.getResource(name)) { "Falta el recurso $name" }.readText()
}
