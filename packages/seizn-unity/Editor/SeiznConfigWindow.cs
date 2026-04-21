using Seizn;
using UnityEditor;
using UnityEngine;

namespace Seizn.Editor
{
    [FilePath("ProjectSettings/Seizn.asset", FilePathAttribute.Location.ProjectFolder)]
    public sealed class SeiznProjectSettings : ScriptableSingleton<SeiznProjectSettings>
    {
        public string apiKey = "";
        public string baseUrl = SeiznClient.DefaultBaseUrl;
        public string defaultNpcId = "demo-npc";

        public void SaveSettings()
        {
            Save(true);
        }
    }

    public sealed class SeiznConfigWindow : EditorWindow
    {
        [MenuItem("Window/Seizn/Settings")]
        public static void Open()
        {
            GetWindow<SeiznConfigWindow>("Seizn");
        }

        private void OnGUI()
        {
            var settings = SeiznProjectSettings.instance;
            EditorGUILayout.LabelField("Seizn Unity SDK", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Stored at ProjectSettings/Seizn.asset. Do not commit this file when it contains a live API key.",
                MessageType.Info);

            settings.apiKey = EditorGUILayout.PasswordField("API key", settings.apiKey);
            settings.baseUrl = EditorGUILayout.TextField("Base URL", string.IsNullOrWhiteSpace(settings.baseUrl) ? SeiznClient.DefaultBaseUrl : settings.baseUrl);
            settings.defaultNpcId = EditorGUILayout.TextField("Default NPC ID", settings.defaultNpcId);

            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Save"))
                {
                    settings.SaveSettings();
                }

                if (GUILayout.Button("Reset URL"))
                {
                    settings.baseUrl = SeiznClient.DefaultBaseUrl;
                    settings.SaveSettings();
                }
            }
        }
    }
}
