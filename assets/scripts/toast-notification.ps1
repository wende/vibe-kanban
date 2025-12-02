param(
    [Parameter(Mandatory=$true)]
    [string]$Title,

    [Parameter(Mandatory=$true)]
    [string]$Message,

    [Parameter(Mandatory=$false)]
    [string]$Url = "",

    [Parameter(Mandatory=$false)]
    [string]$AppName = "Vibe Kanban"
)

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null

# Build XML with launch action if URL is provided
if ($Url -ne "") {
    # Create custom XML with launch action
    $XmlString = @"
<toast launch="$Url" activationType="protocol">
    <visual>
        <binding template="ToastText02">
            <text id="1">$([System.Security.SecurityElement]::Escape($Title))</text>
            <text id="2">$([System.Security.SecurityElement]::Escape($Message))</text>
        </binding>
    </visual>
</toast>
"@
    $SerializedXml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $SerializedXml.LoadXml($XmlString)
} else {
    # Use standard template without launch action
    $Template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $RawXml = [xml] $Template.GetXml()
    ($RawXml.toast.visual.binding.text|where {$_.id -eq "1"}).AppendChild($RawXml.CreateTextNode($Title)) | Out-Null
    ($RawXml.toast.visual.binding.text|where {$_.id -eq "2"}).AppendChild($RawXml.CreateTextNode($Message)) | Out-Null
    $SerializedXml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $SerializedXml.LoadXml($RawXml.OuterXml)
}

$Toast = [Windows.UI.Notifications.ToastNotification]::new($SerializedXml)
$Toast.Tag = $AppName
$Toast.Group = $AppName
$Notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppName)
$Notifier.Show($Toast)