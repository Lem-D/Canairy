Drop extra root CA certificates here as PEM `*.crt` files and they will be trusted during image builds.

Needed when antivirus "HTTPS scanning" (AVG/Avast) or a corporate proxy intercepts TLS —
builds otherwise fail with `SSL certificate problem: unable to get local issuer certificate`.

Export the AVG root on Windows (PowerShell):

    $c = Get-ChildItem Cert:\LocalMachine\Root | ? Subject -like '*AVG Web/Mail Shield Root*'
    "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($c.RawData,'InsertLineBreaks') + "`n-----END CERTIFICATE-----" | Set-Content docker\certs\avg-root.crt -Encoding ascii

`*.crt` files here are gitignored (they're machine-specific).
