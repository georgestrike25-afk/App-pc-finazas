package com.afinador.acustico.ui.brand

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.afinador.acustico.R
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.acustico.ui.theme.BrandColors

/** Margen inferior para la curva de la "o", que baja apenas por debajo de la línea base. */
private const val WORDMARK_PAD = 2f

/**
 * Logotipo "EnTono": "En" en el color del texto y "Tono" en verde, con los contornos de la tipografía
 * de la marca. Se adapta a los temas claro y oscuro.
 */
@Composable
fun EnTonoWordmark(
    height: Dp,
    modifier: Modifier = Modifier,
    enColor: Color = AppTheme.colors.text,
    tonoColor: Color = AppTheme.colors.accent,
) {
    val viewportHeight = WORDMARK_HEIGHT + WORDMARK_PAD
    val vector = remember(enColor, tonoColor) {
        ImageVector.Builder(
            name = "EnTono",
            defaultWidth = (WORDMARK_WIDTH / viewportHeight * 24f).dp,
            defaultHeight = 24.dp,
            viewportWidth = WORDMARK_WIDTH,
            viewportHeight = viewportHeight,
        )
            .addPath(pathData = addPathNodes(WORDMARK_EN), fill = SolidColor(enColor))
            .addPath(pathData = addPathNodes(WORDMARK_TONO), fill = SolidColor(tonoColor))
            .build()
    }
    Image(
        painter = rememberVectorPainter(vector),
        contentDescription = null,
        modifier = modifier
            .height(height)
            .aspectRatio(WORDMARK_WIDTH / viewportHeight)
            .semantics { contentDescription = "EnTono" }
            .testTag("marca_entono"),
    )
}

/** Marca simplificada (clavijero y medidor sin detalles finos) sobre grafito, para tamaños chicos. */
@Composable
fun EnTonoMark(size: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.26f))
            .background(BrandColors.Graphite),
    ) {
        Image(painterResource(R.drawable.ic_entono_mark), contentDescription = null, modifier = Modifier.fillMaxSize())
    }
}

/** Ícono completo de la app (fondo + clavijero detallado), como se ve en el lanzador. */
@Composable
fun EnTonoAppIcon(size: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.24f)),
    ) {
        // Los vectores del ícono adaptable miden 108 × 108; el lanzador muestra los 72 centrales.
        val zoom = Modifier.fillMaxSize().graphicsLayer(scaleX = 1.5f, scaleY = 1.5f)
        Image(painterResource(R.drawable.ic_launcher_background), contentDescription = null, contentScale = ContentScale.FillBounds, modifier = zoom)
        Image(painterResource(R.drawable.ic_launcher_foreground), contentDescription = null, contentScale = ContentScale.FillBounds, modifier = zoom)
    }
}
