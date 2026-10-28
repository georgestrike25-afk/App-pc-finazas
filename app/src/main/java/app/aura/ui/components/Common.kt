package app.aura.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.aura.ui.theme.Aura

@Composable
fun AuraCard(modifier: Modifier = Modifier, padding: Int = 20, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = Aura.tokens.card,
        border = BorderStroke(1.dp, Aura.tokens.cardBorder),
    ) {
        Column(Modifier.padding(padding.dp), content = content)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = Aura.tokens.mutedText,
        modifier = modifier.padding(start = 4.dp, top = 20.dp, bottom = 8.dp),
    )
}

@Composable
fun ScreenHeader(title: String, onBack: (() -> Unit)? = null, trailing: @Composable () -> Unit = {}) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 8.dp),
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack) {
                Icon(painterResource(app.aura.R.drawable.ic_ui_back), contentDescription = "Volver")
            }
        } else {
            Spacer(Modifier.width(4.dp))
        }
        Text(title, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f).padding(start = 4.dp))
        trailing()
    }
}

/** Selector segmentado compacto y accesible (rol de botón de opción). */
@Composable
fun <T> Segmented(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        options.forEach { (value, label) ->
            val isSelected = value == selected
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .weight(1f)
                    .height(38.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(if (isSelected) MaterialTheme.colorScheme.surface else Color.Transparent)
                    .semantics { this.selected = isSelected }
                    .clickable(enabled = enabled, role = Role.RadioButton) { onSelect(value) },
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Medium,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    color = when {
                        !enabled -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                        isSelected -> MaterialTheme.colorScheme.onSurface
                        else -> Aura.tokens.mutedText
                    },
                )
            }
        }
    }
}

@Composable
fun ColorSwatches(colors: List<Color>, selected: Color, onSelect: (Color) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        colors.forEach { c ->
            val isSelected = c == selected
            Box(
                Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(c)
                    .border(
                        width = if (isSelected) 3.dp else 1.dp,
                        color = if (isSelected) Aura.tokens.accent else MaterialTheme.colorScheme.outline,
                        shape = CircleShape,
                    )
                    .semantics { this.selected = isSelected }
                    .clickable(role = Role.RadioButton) { onSelect(c) },
            )
        }
    }
}

@Composable
fun LabeledRow(label: String, modifier: Modifier = Modifier, supporting: String? = null, trailing: @Composable () -> Unit) {
    Row(modifier = modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            if (supporting != null) Text(supporting, style = MaterialTheme.typography.bodySmall, color = Aura.tokens.mutedText)
        }
        trailing()
    }
}
