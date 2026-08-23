:setvar FunctionAppName "replace-with-function-app-name"

IF OBJECT_ID('dbo.ResidentApplications', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ResidentApplications (
    ApplicationId uniqueidentifier NOT NULL PRIMARY KEY,
    FullName nvarchar(100) NOT NULL,
    Email nvarchar(254) NOT NULL,
    Phone nvarchar(30) NULL,
    Situation nvarchar(1000) NULL,
    Timeline varchar(20) NULL,
    SubmittedAt datetime2(0) NOT NULL
      CONSTRAINT DF_ResidentApplications_SubmittedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_ResidentApplications_Timeline
      CHECK (Timeline IS NULL OR Timeline IN ('asap', '30days', '60days', 'exploring'))
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '$(FunctionAppName)')
  CREATE USER [$(FunctionAppName)] FROM EXTERNAL PROVIDER;
GO

GRANT INSERT ON dbo.ResidentApplications TO [$(FunctionAppName)];
GO
