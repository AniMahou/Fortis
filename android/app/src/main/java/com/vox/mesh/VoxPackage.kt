package com.vox.mesh

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Registers VOX's three native modules.
 *
 * Extends BaseReactPackage rather than implementing ReactPackage directly so
 * the modules are lazily instantiated and work under both the old and new
 * architectures. That matters because it is the abandoned-library
 * incompatibility this code exists to avoid (docs/DECISIONS.md D1) — it would
 * be an unfortunate irony to reintroduce it here.
 */
class VoxPackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        when (name) {
            VoxMeshModule.NAME -> VoxMeshModule(reactContext)
            VoxLocationModule.NAME -> VoxLocationModule(reactContext)
            VoxKeystoreModule.NAME -> VoxKeystoreModule(reactContext)
            else -> null
        }

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        listOf(VoxMeshModule.NAME, VoxLocationModule.NAME, VoxKeystoreModule.NAME)
            .associateWith { name ->
                ReactModuleInfo(
                    name,
                    name,
                    /* canOverrideExistingModule = */ false,
                    /* needsEagerInit = */ false,
                    /* isCxxModule = */ false,
                    /* isTurboModule = */ false,
                )
            }
    }
}
