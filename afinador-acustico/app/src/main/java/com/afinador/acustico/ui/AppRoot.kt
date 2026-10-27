package com.afinador.acustico.ui

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.afinador.acustico.TunerViewModel
import com.afinador.acustico.ui.components.AppIcons
import com.afinador.acustico.ui.screens.AboutScreen
import com.afinador.acustico.ui.screens.ChromaticScreen
import com.afinador.acustico.ui.screens.OnboardingOverlay
import com.afinador.acustico.ui.screens.PrivacyScreen
import com.afinador.acustico.ui.screens.SettingsScreen
import com.afinador.acustico.ui.screens.TunerScreen
import com.afinador.acustico.ui.screens.TuningsScreen
import com.afinador.acustico.ui.theme.AppTheme
import com.afinador.core.TunerMode

enum class Tab(val label: String, val icon: ImageVector) {
    TUNER("Afinador", AppIcons.Headstock),
    CHROMATIC("Cromático", AppIcons.Wave),
    TUNINGS("Afinaciones", AppIcons.Tunings),
    SETTINGS("Ajustes", AppIcons.Settings),
}

enum class SubPage { NONE, PRIVACY, ABOUT }

/** Estado del permiso de micrófono. */
enum class MicPermission { GRANTED, NOT_REQUESTED, DENIED, BLOCKED }

@Composable
fun AppRoot(viewModel: TunerViewModel) {
    val settings = viewModel.settings.collectAsStateWithLifecycle().value
    val colors = AppTheme.colors
    if (settings == null) {
        Box(Modifier.fillMaxSize().background(colors.background))
        return
    }
    val context = LocalContext.current
    val reading by viewModel.reading.collectAsStateWithLifecycle()
    val selectedString by viewModel.selectedString.collectAsStateWithLifecycle()
    val audioStatus by viewModel.audioStatus.collectAsStateWithLifecycle()

    var tab by rememberSaveable { mutableStateOf(Tab.TUNER) }
    var subPage by rememberSaveable { mutableStateOf(SubPage.NONE) }
    var showTutorial by rememberSaveable { mutableStateOf(false) }
    var calibrating by remember { mutableStateOf(false) }
    var foreground by remember { mutableStateOf(false) }
    var askedOnce by rememberSaveable { mutableStateOf(false) }

    fun currentPermission(): MicPermission {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            return MicPermission.GRANTED
        }
        if (!askedOnce) return MicPermission.NOT_REQUESTED
        val activity = context as? Activity
        val canAskAgain = activity?.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO) ?: true
        return if (canAskAgain) MicPermission.DENIED else MicPermission.BLOCKED
    }
    var permission by remember { mutableStateOf(currentPermission()) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        askedOnce = true
        permission = currentPermission()
    }
    val requestMic: () -> Unit = {
        if (permission == MicPermission.BLOCKED) {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } else {
            launcher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    // Ciclo de vida: el micrófono sólo se usa con la app visible.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> {
                    foreground = true
                    permission = currentPermission() // por si se otorgó desde los ajustes del sistema
                }
                Lifecycle.Event.ON_STOP -> foreground = false
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            viewModel.setListening(false)
        }
    }

    val onboarding = !settings.onboardingDone || showTutorial
    val wantsAudio = foreground && permission == MicPermission.GRANTED && !onboarding && subPage == SubPage.NONE &&
        (tab == Tab.TUNER || tab == Tab.CHROMATIC || calibrating)
    LaunchedEffect(wantsAudio) { viewModel.setListening(wantsAudio) }
    LaunchedEffect(tab) { viewModel.setMode(if (tab == Tab.CHROMATIC) TunerMode.CHROMATIC else TunerMode.STRINGS) }

    // Mantener la pantalla encendida mientras se afina.
    val view = LocalView.current
    DisposableEffect(settings.keepScreenOn, wantsAudio) {
        view.keepScreenOn = settings.keepScreenOn && wantsAudio
        onDispose { view.keepScreenOn = false }
    }

    BackHandler(enabled = subPage != SubPage.NONE || tab != Tab.TUNER) {
        if (subPage != SubPage.NONE) subPage = SubPage.NONE else tab = Tab.TUNER
    }

    Box(Modifier.fillMaxSize().background(colors.background)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Box(Modifier.weight(1f)) {
                when (subPage) {
                    SubPage.PRIVACY -> PrivacyScreen(onBack = { subPage = SubPage.NONE })
                    SubPage.ABOUT -> AboutScreen(onBack = { subPage = SubPage.NONE })
                    SubPage.NONE -> when (tab) {
                        Tab.TUNER -> TunerScreen(
                            settings = settings,
                            reading = reading,
                            selectedString = selectedString,
                            permission = permission,
                            audioStatus = audioStatus,
                            onRequestMic = requestMic,
                            onSelectString = viewModel::selectString,
                            onAuto = { viewModel.selectString(selectedString) },
                            onOpenTunings = { tab = Tab.TUNINGS },
                            onOpenSettings = { tab = Tab.SETTINGS },
                            onTranspose = viewModel::changeTranspose,
                            onResetTranspose = { viewModel.setTranspose(0) },
                        )
                        Tab.CHROMATIC -> ChromaticScreen(
                            settings = settings,
                            reading = reading,
                            permission = permission,
                            audioStatus = audioStatus,
                            onRequestMic = requestMic,
                            onOpenSettings = { tab = Tab.SETTINGS },
                        )
                        Tab.TUNINGS -> TuningsScreen(
                            settings = settings,
                            onSelect = viewModel::selectTuning,
                            onSave = viewModel::saveCustomTuning,
                            onDuplicate = viewModel::duplicateTuning,
                            onDelete = viewModel::deleteCustomTuning,
                            onResetTranspose = { viewModel.setTranspose(0) },
                        )
                        Tab.SETTINGS -> SettingsScreen(
                            settings = settings,
                            reading = reading,
                            permission = permission,
                            onRequestMic = requestMic,
                            viewModel = viewModel,
                            onCalibratingChange = { calibrating = it },
                            onOpenTunings = { tab = Tab.TUNINGS },
                            onOpenPrivacy = { subPage = SubPage.PRIVACY },
                            onOpenAbout = { subPage = SubPage.ABOUT },
                            onOpenTutorial = { showTutorial = true },
                        )
                    }
                }
            }
            HorizontalDivider(color = colors.outline)
            BottomBar(current = tab, onSelect = { tab = it; subPage = SubPage.NONE })
        }

        if (onboarding) {
            OnboardingOverlay(
                onFinish = {
                    viewModel.setOnboardingDone(true)
                    showTutorial = false
                    if (permission != MicPermission.GRANTED) requestMic()
                },
            )
        }
    }
}

@Composable
private fun BottomBar(current: Tab, onSelect: (Tab) -> Unit) {
    val colors = AppTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .background(colors.surface)
            .padding(horizontal = 6.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceAround,
    ) {
        Tab.entries.forEach { t ->
            val selected = t == current
            val tint = if (selected) colors.accent else colors.textMuted
            Column(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (selected) colors.accentSoft else colors.surface)
                    .clickable { onSelect(t) }
                    .semantics {
                        role = Role.Tab
                        this.selected = selected
                    }
                    .testTag("tab_${t.name.lowercase()}")
                    .padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(t.icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
                Text(t.label, color = tint, fontSize = 11.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
    }
}
